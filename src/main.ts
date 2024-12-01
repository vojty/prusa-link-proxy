import "dotenv/config";
import proxy from "@fastify/http-proxy";
import Fastify from "fastify";

import { createDigestAuthHeader, registerBodyParser } from "./utils.ts";

const {
	// Required
	PRUSA_LINK_USERNAME,
	PRUSA_LINK_PASSWORD,
	PRUSA_LINK_ORIGIN,
	// Optional
	PROXY_PORT = 5050,
	PROXY_BODY_LIMIT,
	PROXY_DEBUG,
} = process.env;
if (!PRUSA_LINK_USERNAME || !PRUSA_LINK_PASSWORD || !PRUSA_LINK_ORIGIN) {
	console.error(
		"Please provide PRUSA_LINK_ORIGIN, PRUSA_LINK_USERNAME and PRUSA_LINK_PASSWORD in .env file or as environment variables",
	);
	process.exit(1);
}

type AuthInfo = {
	realm: string;
	nonce: string;
};

// Auth info for digest auth
let authInfo: AuthInfo | null = null;

const authRoutes = ["/api", "/thumb"];
const upstream = PRUSA_LINK_ORIGIN.replace(/\/$/, "");

// Create a Fastify instance
const server = Fastify();
// add timestamp to log
const log = PROXY_DEBUG
	? console.log.bind(console, `${new Date().toISOString()} |`)
	: () => {};

registerBodyParser(server, PROXY_BODY_LIMIT || "50MiB");

server.register(proxy, {
	contentTypesToEncode: [
		"application/json",
		"application/gcode",
		"application/gcode+binary",
	],
	upstream,
	preHandler: (req, reply, done) => {
		/**
		 * Add digest auth header to the request
		 * if there is no previous auth info (nonce, realm), the request will fail with 401
		 * and the retryDelay function will be called to add the auth header
		 */
		log("Stored Auth info:", authInfo);
		log(`-> Requested ${req.url}`);
		if (authInfo && authRoutes.some((prefix) => req.url.startsWith(prefix))) {
			req.headers.authorization = createDigestAuthHeader({
				method: req.method,
				uri: req.url,
				nonce: authInfo.nonce,
				username: PRUSA_LINK_USERNAME,
				password: PRUSA_LINK_PASSWORD,
				realm: authInfo.realm,
			});
			log(`-> Added 'Authorization: ${req.headers.authorization}`);
		}
		done();
	},

	replyOptions: {
		retriesCount: 1,
		retryDelay: ({ attempt, req, res }) => {
			// wrong types - `res` & `res` objects are not a Fastify objects
			const response = res as unknown as {
				headers: { [key: string]: string };
				statusCode: number;
			};
			const request = req as unknown as {
				method: string;
				url: URL;
			};
			try {
				const wwwAuthenticateHeader = response.headers["www-authenticate"];
				const shouldComputeDigestAuth =
					attempt === 0 &&
					response.statusCode === 401 &&
					!!wwwAuthenticateHeader;

				log(
					`<- Retrying ${request.url.pathname}, attemp: ${attempt}, statusCode: ${response.statusCode}, www-authenticate: ${wwwAuthenticateHeader}`,
				);
				if (shouldComputeDigestAuth) {
					// Parse `realm` and `nonce` from www-authenticate header
					const realm = wwwAuthenticateHeader
						.toString()
						.match(/realm="([^"]+)"/)
						?.at(1);
					const nonce = wwwAuthenticateHeader
						.toString()
						.match(/nonce="([^"]+)"/)
						?.at(1);

					if (!realm || !nonce) {
						throw new Error(
							`Cannot parse realm or nonce from www-authenticate header: ${wwwAuthenticateHeader}`,
						);
					}

					// add auth header to the request and retry
					req.headers.authorization = createDigestAuthHeader({
						method: request.method,
						uri: request.url.pathname,
						nonce,
						username: PRUSA_LINK_USERNAME,
						password: PRUSA_LINK_PASSWORD,
						realm,
					});
					log(`-> (retry) Added 'Authorization: ${req.headers.authorization}`);
					//	store auth header
					authInfo = { realm, nonce };
					log("(retry) Stored auth info", { realm, nonce });

					return 10;
				}
			} catch (error) {
				console.log(res);
				console.error(error);
			}
			return null;
		},
	},
});

const port = PROXY_PORT ? Number(PROXY_PORT) : 5050;
server.listen({ port }).then(() => {
	console.log(`Proxying request from http://localhost:${port} to ${upstream}`);
});
