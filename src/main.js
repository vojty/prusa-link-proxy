import "dotenv/config";
import http from "node:http";
import httpProxy from "http-proxy";
// @ts-expect-error internals without typings
import web_o from "http-proxy/lib/http-proxy/passes/web-outgoing.js";
import { createDigestAuthHeader } from "./utils.js";

// extend IncomingMessage with `retry` property
/**
 * @typedef {import('http').IncomingMessage & { retry?: boolean }} CustomIncomingMessage
 */

const {
	// Required
	PRUSA_LINK_USERNAME,
	PRUSA_LINK_PASSWORD,
	PRUSA_LINK_ORIGIN,
	// Optional
	PROXY_PORT = 5050,
	PROXY_DEBUG,
} = process.env;
if (!PRUSA_LINK_USERNAME || !PRUSA_LINK_PASSWORD || !PRUSA_LINK_ORIGIN) {
	console.error(
		"Please provide PRUSA_LINK_ORIGIN, PRUSA_LINK_USERNAME and PRUSA_LINK_PASSWORD in .env file or as environment variables",
	);
	process.exit(1);
}

const authRoutes = [
	"/api", // API routes
	"/thumb", // Gcode thumbnails
	"/usb", // file downloads
];
const upstream = PRUSA_LINK_ORIGIN.replace(/\/$/, "");
const log = PROXY_DEBUG
	? console.log.bind(console, `${new Date().toISOString()} |`)
	: () => {};

const proxy = httpProxy.createProxyServer({});

/**
 * @type {httpProxy.ServerOptions}
 */
const proxyOptions = {
	target: upstream,
	selfHandleResponse: true,
};

/**
 * @typedef {Object} AuthInfo
 * @property {string} realm
 * @property {string} nonce
 */

/**
 * @type {AuthInfo | null}
 */
let authInfo = null;

// handle outgoing request
proxy.on(
	"proxyReq",
	(proxyReq, /** @type {CustomIncomingMessage} */ req, res, options) => {
		log(`-->> ${req.method} ${req.url}`);

		/**
		 * PrusaLink API has a bug where it calls the API with double slashes which causes the proxy request to fail with 401 -> remove
		 * eg. /api/v1/files/usb//test.bgcode
		 *                      ^^
		 */
		req.url = req.url?.replace(/\/\//g, "/");

		if (authInfo && authRoutes.some((prefix) => req.url?.startsWith(prefix))) {
			const authorization = createDigestAuthHeader({
				method: req.method ?? "",
				uri: req.url ?? "",
				nonce: authInfo.nonce,
				username: PRUSA_LINK_USERNAME,
				password: PRUSA_LINK_PASSWORD,
				realm: authInfo.realm,
			});
			proxyReq.setHeader("Authorization", authorization);
			log(`-->> Added 'Authorization: ${authorization}`);
		}
	},
);

// handle incoming response
proxy.on(
	"proxyRes",
	(proxyRes, /** @type {CustomIncomingMessage} */ req, res) => {
		try {
			const wwwAuthenticateHeader = proxyRes.headers["www-authenticate"];
			const shouldComputeDigestAuth =
				proxyRes.statusCode === 401 && !!wwwAuthenticateHeader;

			log(
				`<<-- ${req.method} ${req.url}`,
				proxyRes.statusCode,
				`| 'www-authenticate: ${wwwAuthenticateHeader}'`,
			);

			// If the response is 401 and contains www-authenticate header, retry the request with new auth info
			if (shouldComputeDigestAuth && !req.retry) {
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

				//	store auth header and retry
				authInfo = { realm, nonce };
				log("<<-- Stored auth info", { realm, nonce });
				log("<<-- Retry request with new auth info");

				// mark the request as retried and retry
				req.retry = true;
				return proxy.web(req, res, proxyOptions);
			}

			// manually apply outgoing middlewares
			// https://github.com/http-party/node-http-proxy/blob/9b96cd725127a024dabebec6c7ea8c807272223d/lib/http-proxy/passes/web-incoming.js#L175-L179
			Object.values(web_o).forEach((responseMiddleware) => {
				if (typeof responseMiddleware === "function") {
					responseMiddleware(req, res, proxyRes, proxyOptions);
				}
			});

			// Proxy response back to the client
			proxyRes.pipe(res);
		} catch (error) {
			console.log(res);
			console.error(error);
		}
	},
);

const port = PROXY_PORT ? Number(PROXY_PORT) : 5050;

// start HTTP server
http
	.createServer((req, res) => {
		// register proxy handler
		proxy.web(req, res, proxyOptions);
	})
	.listen(port, () => {
		console.log(
			`Proxying request from http://localhost:${port} to ${upstream}`,
		);
	});
