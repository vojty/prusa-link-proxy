Prusa Link Proxy
================

This is a simple proxy server that allows you to use the Prusa Link API without the authentication.

It automatically adds the required authentication headers to the requests. The credentials are stored in `.env` file.

You can run this proxy for example on a Raspberry Pi and access the Prusa Link from any device in your network without the need to enter the credentials.

**Warning**: This removes the authentication from the Prusa Link API. Use it at your own risk.

## Limitations
The uploaded files are buffered in the memory and then streamed to the Prusa Link.
This means that the server needs to have enough memory to handle the file uploads and you need to set `PROXY_BODY_LIMIT` in the `.env` file to a reasonable value (defaults to 50MiB).
The UI will show 100% progress after the file is uploaded to the proxy server, but the actual upload to the Prusa Link will still be in progress.

## Usage

You need to have Node.js (ideally `>=20.18.1` but older `20.x` will probably work as well) installed on your machine.

1. Clone the repository
    ```bash
    git clone https://github.com/vojty/prusa-link-proxy.git
    cd prusa-link-proxy
    ```

2. Create a `.env` file with the following content:
    ```ini
    PRUSA_LINK_USERNAME=<username> # `maker` by default
    PRUSA_LINK_PASSWORD=<password>
    PRUSA_LINK_ORIGIN=<location of PrusaLink> # eg. http://192.168.1.32
    ```
3. Install the dependencies
    ```bash
    npm ci
    ```
4. Start the proxy server
    ```bash
    npm start
    ```
5. Open the Prusa Link in your browser http://0.0.0.0:5050. (the port be changed in the `.env` file as well using `PROXY_PORT` variable)

### Running in the background
You can use `forever` (https://github.com/foreversd/forever) to run the server in the background. Install it using:
```bash
npm install -g pm2
```

Then start the server using:
```bash
pm2 start "npm run start"
```

Check the status using:
```bash
pm2 list
```

Stop the server using:
```bash
pm2 stop <id>
```