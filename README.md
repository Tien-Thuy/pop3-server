# <p align="center">Power by Hương Đá Group 🇻🇳 </p>

<p align="center">
  <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/tien-thuy/pop3-server/tests.yml"/>
  <a href="https://www.npmjs.com/package/lexical">
    <img alt="Visit the NPM page" src="https://img.shields.io/npm/v/@tien-thuy/pop3-server"/>
  </a>
</p>

# Tien Thủy / POP3 Server

Provide a simple POP3 server. Ready for production.

# Requirements

Node --- >= v20 or newer

# Installation

```bash
npm install @tien-thuy/pop3-server
```

# Usage

```typescript
import POP3 from '@tien-thuy/pop3-server';

const pop3Server = new POP3Server({
  host: '127.0.0.1',
  port: 110,
  TLSOptions: {
    enable: false
  }
});
```

# Options

| Name                  | Required                                  | Type       | Default value                | Description                                                                                                                                                                                         |
|-----------------------|-------------------------------------------|------------|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `host`                | `true`                                    | `string`   |                              | Hostname of your server, default is `localhost`                                                                                                                                                     |
| `port`                | `true`                                    | `number`   |                              | Port to listen on, default is `110`                                                                                                                                                                 |
| `welcomeMessage`      | `false`                                   | `string`   | `Welcome to my POP3 server!` | Welcome message sent to clients upon successful connection.                                                                                                                                         |
| `TLSOptions`.`enable` | `false`                                   | `boolean`  | `false`                      | Enable TLS support, default is `false`. If you want to use TLS, please provide a certificate and key file path in `TLSOptions.certPath` and `TLSOptions.keyPath`, otherwise it will throw an error. |
| `TLSOptions`.`key`    | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to private key file, required if `enable` is true                                                                                                                                              |
| `TLSOptions`.`cert`   | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to public certificate file, required if `enable` is true                                                                                                                                       |
| `TLSOptions`.`ca`     | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to CA certificate file, optional if `enable` is true                                                                                                                                           |
| `idleTimeout`         | `false`                                   | `number`   | `0`                          | Timeout in milliseconds after which the server will automatically disconnect idle connections. Default is `60000` (1 minute).                                                                       |
| `maxConnections`      | `false`                                   | `number`   | `unlimited`                  | Maximum number of concurrent connections allowed. Default is `50`.                                                                                                                                  |
| `idLength`            | `false`                                   | `number`   |                              | Length of generated unique IDs. Default is `32`.                                                                                                                                                    |
| `storage`             | `false`                                   | `object`   |                              | Storage options. See [Storage](#storage) section below for details.                                                                                                                                 |
| `storage`.`get`       | `false`                                   | `function` |                              | Function that returns a storage instance. This can be used to customize how messages are stored and retrieved.                                                                                      |
| `storage`.`set`       | `false`                                   | `function` |                              | Function that stores a message. This can be used to customize how messages are stored and retrieved.                                                                                                |
| `storage`.`destroy`   | `false`                                   | `function` |                              | Function that deletes a message. This can be used to customize how messages are deleted.                                                                                                            |
| `storage`.`list`      | `false`                                   | `function` |                              | Function that lists all messages. This can be used to customize how messages are listed.                                                                                                            |

# Events

| Event Name         | Parameters                                                                                                     | Description                                                                    |
|--------------------|----------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `connect`          | `event: { id: string; remoteAddress: string; secure: boolean }`                                                | Emitted when a new connection is established.                                  |
| `close`            | None                                                                                                           | Emitted when the server is closed.                                             |
| `LOGIN`            | `event: { connection: POP3Connection; username: string; password: string; auth: (success: boolean) => void; }` | Emitted when a login attempt is made. Use `auth` to approve or deny the login. |
| `QUIT`             | `event: POP3Connection`                                                                                        | Emitted when a quit command is received.                                       |
| `STAT`             | `connection: POP3Connection, callback: (messageCount: number, totalSize: number) => void`                      | Emitted when a STAT command is received. Provide number of messages and size.  |
| `LIST`             | `connection: POP3Connection, messageNumber?: number, callback: (messages: { number: number; size: number }[]   | Emitted when a LIST command is received. Provides a list of emails.            |
| `RETR`             | `connection: POP3Connection, messageNumber: number, callback: (content: string) => void`                       | Emitted when a RETR command is received. Return email content.                 |
| `DELE`             | `connection: POP3Connection, messageNumber: number`                                                            | Emitted when a DELETE command is received. Marks the email for deletion.       |
| `NOOP`             | `connection: POP3Connection`                                                                                   | Emitted when a NOOP command is received.                                       |
| `RSET`             | `connection: POP3Connection`                                                                                   | Emitted when a RSET command is received. Resets all marked deletions.          |
| `CAPA`             | `connection: POP3Connection, callback: (capabilities: string[]) => void`                                       | Emitted when a CAPA command is received. Provide server capabilities.          |
| `connection:close` | `connection: POP3Connection`                                                                                   | Emitted when a connection is closed.                                           |
| `data`             | `event: { connection: POP3Connection; data: Buffer }`                                                          | Emitted when data is received from a connection.                               |
| `timeout`          | `event: POP3Connection`                                                                                        | Emitted when a connection times out.                                           |
| `listening`        | `info: { address: string; port: number; secure: boolean }`                                                     | Emitted when the server starts listening for connections.                      |
| `error`            | `error: Error`                                                                                                 | Emitted when an error occurs.                                                  |
