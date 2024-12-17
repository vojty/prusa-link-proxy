import { createHash } from "node:crypto";

/**
 * @param {string} s
 */
const md5 = (s) => {
	const hash = createHash("md5");
	hash.update(s, "utf8");
	return hash.digest("hex");
};

/**
 * @typedef	{Object} AuthHeaderOptions
 * @property {string} method
 * @property {string} uri
 * @property {string} nonce
 * @property {string} username
 * @property {string} password
 * @property {string} realm
 */

// based on https://github.com/node-modules/urllib/blob/v4.6.8/src/utils.ts#L67
/**
 * @param {AuthHeaderOptions} options
 */
export const createDigestAuthHeader = ({
	method,
	uri,
	nonce,
	username,
	password,
	realm,
}) => {
	const ha1 = md5(`${username}:${realm}:${password}`);
	const ha2 = md5(`${method.toUpperCase()}:${uri}`);
	const response = md5(`${ha1}:${nonce}:${ha2}`);
	const authstring = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
	return authstring;
};
