import { createHash } from "node:crypto";
import queryString from "fast-querystring";
import type { FastifyInstance } from "fastify";
import { parseSize } from "xbytes";

const md5 = (s: string) => {
	const hash = createHash("md5");
	hash.update(s, "utf8");
	return hash.digest("hex");
};

type AuthHeaderOptions = {
	method: string;
	uri: string; // relative URI eg. "/api"
	nonce: string;
	username: string;
	password: string;
	realm: string;
};

// based on https://github.com/node-modules/urllib/blob/v4.6.8/src/utils.ts#L67
export const createDigestAuthHeader = ({
	method,
	uri,
	nonce,
	username,
	password,
	realm,
}: AuthHeaderOptions) => {
	const ha1 = md5(`${username}:${realm}:${password}`);
	const ha2 = md5(`${method.toUpperCase()}:${uri}`);
	const response = md5(`${ha1}:${nonce}:${ha2}`);
	const authstring = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
	return authstring;
};

// based on https://github.com/fastify/fastify-formbody/blob/master/formbody.js
export const registerBodyParser = (
	server: FastifyInstance,
	bodyLimitString: string, // e.g. "50MiB"
) => {
	const bodyLimit = parseSize(bodyLimitString);

	type ContentParser = Parameters<typeof server.addContentTypeParser>[2];

	const contentParser: ContentParser = (req, body, done) => {
		done(null, queryString.parse(body.toString()));
	};

	server.addContentTypeParser(
		"application/gcode+binary",
		{ parseAs: "buffer", bodyLimit },
		contentParser,
	);
	server.addContentTypeParser(
		"application/gcode",
		{ parseAs: "buffer", bodyLimit },
		contentParser,
	);
};
