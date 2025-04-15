import { EventEmitter } from 'events';
import * as net from "node:net";
import * as tls from "node:tls";
import * as randomString from "randomstring";
import { Buffer } from 'node:buffer';
import { POP3Connection, POP3ServerConfig, POP3ServerEvents, IStorage } from "./interface";
import Storage from "./storage";
import * as console from "node:console";

export default class POP3Server extends EventEmitter {
  private readonly config: POP3ServerConfig;
  private running: boolean;
  private server?: net.Server | tls.Server;
  private storage: IStorage;
  private connected: POP3Connection[];

  public on<E extends keyof POP3ServerEvents>(event: E, listener: POP3ServerEvents[E]): this {
    return super.on(event, listener as any);
  }

  public once<E extends keyof POP3ServerEvents>(event: E, listener: POP3ServerEvents[E]): this {
    return super.once(event, listener as any);
  }

  public emit<E extends keyof POP3ServerEvents>(event: E, ...args: Parameters<POP3ServerEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  constructor(config: POP3ServerConfig) {
    super();
    if (!config.storage) {
      const storage = new Storage();
      config.storage = {
        get: storage.get.bind(storage),
        set: storage.set.bind(storage),
        destroy: storage.destroy.bind(storage),
        list: storage.list.bind(storage)
      }
    }

    this.config = {
      ...{
        welcomeMessage: 'Welcome to Tien Thuy POP3 Server',
        TLSOptions: {
          enable: false
        },
        idleTimeout: 180000,
        maxConnections: 0,
        idLength: 22
      },
      ...config
    };
    this.storage = this.config.storage;
    this.running = false;
    this.connected = [];
  }

  public async start() {
    console.info(`Starting POP3 server at ${this.config.port}...`);
    if (this.running) {
      throw new Error('POP3 server is started.');
    }
    if (!this.config.TLSOptions.enable) {
      this.server = net.createServer({
        allowHalfOpen: false,
        pauseOnConnect: false
      });
    } else {
      if (!this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
        throw new Error('TLS key and cert are required.');
      }

      this.server = tls.createServer(this.config.TLSOptions);
    }

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));
    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        this.running = true;
        this.emit('listening', {
          address: this.config.host,
          port: this.config.port,
          secure: this.config.TLSOptions.enable
        });
        resolve();
      });
    });
    console.log(`POP3 is started at ${this.config.host}:${this.config.port} (${this.config.TLSOptions.enable ? 'secure' : 'standard'})`);
  }

  public async stop() {
    if (!this.running || !this.server) {
      throw new Error('POP3 server is not started.');
    }

    this.connected.forEach(connection => {
      this.closeConnection(connection);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.running = false;
          this.emit('close');
          resolve();
        }
      });
    });
  }

  public async closeConnection(connection: POP3Connection, reason: string = 'Server shutdown') {
    try {
      if (!connection.socket.destroyed) {
        connection.socket.end();
      }
    } catch (error) {
      console.error(`Error closing connection ${connection.id}:`, error);
    } finally {
      await this.storage.destroy(connection.id);
    }
  }

  private async handleConnection(socket: net.Socket | tls.TLSSocket): Promise<void> {
    if (this.config.maxConnections !== 0 && (await this.storage.list()).size >= this.config.maxConnections) {
      socket.end('-ERR Too many connections\r\n');
      socket.destroy();
      return;
    }

    const id: string = randomString.generate(this.config.idLength);
    const secure = this.config.TLSOptions.enable || socket instanceof tls.TLSSocket;
    const connection: POP3Connection = {
      id,
      socket
    };
    await this.storage.set(id, {
      state: 'authorization',
      secure
    });
    socket.on('close', () => this.handleOnClose(connection));
    socket.on('timeout', () => this.handleOnTimeout(connection));
    socket.on('error', (error) => this.handleOnError(connection, error));
    socket.on('data', (data) => this.handleOnData(connection, data))
    if (this.config.idleTimeout !== 0) {
      socket.setTimeout(this.config.idleTimeout);
    }

    this.connected.push(connection);
    this.sendCommand(connection, `+OK ${this.config.welcomeMessage}`);
    this.emit('connect', {
      id: id,
      remoteAddress: socket.remoteAddress,
      secure
    });
  }

  private handleError(error: Error): void {
    console.error('Server error:', error);
    this.emit('error', error);
  }

  private handleOnClose(connection: POP3Connection) {
    this.emit('close')
  }

  private handleOnTimeout(connection: POP3Connection) {
    this.emit('timeout', connection);
  }

  private handleOnError(connection: POP3Connection, error: any) {
    this.emit('error', error);
  }

  private async handleOnData(connection: POP3Connection, data: Buffer): Promise<void> {
    this.emit('data', {
      connection,
      data
    });
    const commandLines: string[] = data.toString('utf8').split('\r\n').filter(Boolean);
    for (const _commands of commandLines) {
      console.log(`[${connection.id}] R: ${_commands}`);
      const commands: string[] = _commands.split(' ');
      const connectInfo = await this.storage.get(connection.id);
      if (!connectInfo) {
        await this.sendCommand(connection, '* BAD Connection not found');
        return;
      }

      const command: string = commands[0].toUpperCase();
      const args: string[] = commands.slice(1);
      switch (command) {
        case 'USER':
          this.commandUSER(connection, args);
          break;
        case 'PASS':
          this.commandPASS(connection, args);
          break;
        case 'STAT':
          this.commandSTAT(connection);
          break;
        case 'LIST':
          this.commandLIST(connection, args);
          break;
        case 'RETR':
          this.commandRETR(connection, args);
          break;
        case 'DELE':
          this.commandDELE(connection, args);
          break;
        case 'NOOP':
          this.sendCommand(connection, '+OK');
          break;
        case 'RSET':
          this.commandRSET(connection, args);
          break;
        case 'QUIT':
          this.commandQUIT(connection);
          break;
        case 'TOP':
          this.commandTOP(connection, args);
          break;
        case 'UIDL':
          this.commandUIDL(connection, args);
          break;
        case 'CAPA':
          this.commandCAPA(connection);
          break;
        default:
          console.error('commands unknown', command)
          this.sendCommand(connection, '-ERR Command not recognized');
          break;
      }
    }
  }

  private async sendCommand(connection: POP3Connection, response: string): Promise<void> {
    try {
      if (connection.socket.writable) {
        connection.socket.write(response + '\r\n');
        console.log(`[${connection.id}] S: ${response}`);
      }
    } catch (error) {
      console.error(`Error sending response to ${connection.id}:`, error);
      await this.closeConnection(connection, 'Failed to send response');
    }
  }

  private async commandUSER(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state !== 'authorization') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    if (args.length < 1) {
      this.sendCommand(connection, '-ERR Missing username');
      return;
    }

    const username = args[0];
    connectInfo.user = username;
    await this.storage.set(connection.id, connectInfo);

    this.sendCommand(connection, '+OK User name accepted, password please');
  }

  private async commandPASS(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);
    if (connectInfo.state !== 'authorization' || !connectInfo.user) {
      this.sendCommand(connection, '-ERR Please provide username first');
      return;
    }
    if (args.length < 1) {
      this.sendCommand(connection, '-ERR Missing password');
      return;
    }
    if (!this.listenerCount('LOGIN')) {
      this.sendCommand(connection, '-ERR Authentication failed');
      return;
    }

    const password = args[0];

    this.emit('LOGIN', {
      connection,
      username: connectInfo.user,
      password: password,
      auth: (success: boolean) => {
        if (success) {
          connectInfo.state = 'transaction';
          this.storage.set(connection.id, connectInfo);
          this.sendCommand(connection, '+OK Logged in');
        } else {
          this.sendCommand(connection, '-ERR Authentication failed');
        }
      }
    });
  }

  private async commandSTAT(connection: POP3Connection): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);
    if (connectInfo.state !== 'transaction') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    // Kích hoạt sự kiện để lấy thông tin số lượng thư và kích thước
    this.emit('STAT', connection, (messageCount: number, totalSize: number) => {
      this.sendCommand(connection, `+OK ${messageCount} ${totalSize}`);
    });
  }

  private async commandLIST(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state !== 'transaction') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    const messageNumber = args.length > 0 ? parseInt(args[0], 10) : null;

    this.emit('LIST', connection, messageNumber, (messages: Array<{ number: number, size: number }> | null) => {
      if (messageNumber !== null) {
        const message = messages?.[0];
        if (message) {
          this.sendCommand(connection, `+OK ${message.number} ${message.size}`);
        } else {
          this.sendCommand(connection, '-ERR No such message');
        }
      } else {
        this.sendCommand(connection, `+OK Scan listing follows`);
        if (messages) {
          messages.forEach(msg => {
            this.sendCommand(connection, `${msg.number} ${msg.size}`);
          });
        }
        this.sendCommand(connection, '.');
      }
    });
  }

  private async commandRETR(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state !== 'transaction') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    const messageNumber = args.length > 0 ? parseInt(args[0], 10) : null;

    this.emit('LIST', connection, messageNumber, (messages: Array<{ number: number, size: number }> | null) => {
      if (messageNumber !== null) {
        const message = messages?.[0];
        if (message) {
          this.sendCommand(connection, `+OK ${message.number} ${message.size}`);
        } else {
          this.sendCommand(connection, '-ERR No such message');
        }
      } else {
        this.sendCommand(connection, `+OK Scan listing follows`);
        if (messages) {
          messages.forEach(msg => {
            this.sendCommand(connection, `${msg.number} ${msg.size}`);
          });
        }
        this.sendCommand(connection, '.');
      }
    });
  }

  private async commandDELE(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state !== 'transaction') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    const messageNumber = args.length > 0 ? parseInt(args[0], 10) : null;

    this.emit('LIST', connection, messageNumber, (messages: Array<{ number: number, size: number }> | null) => {
      if (messageNumber !== null) {
        const message = messages?.[0];
        if (message) {
          this.sendCommand(connection, `+OK ${message.number} ${message.size}`);
        } else {
          this.sendCommand(connection, '-ERR No such message');
        }
      } else {
        this.sendCommand(connection, `+OK Scan listing follows`);
        if (messages) {
          messages.forEach(msg => {
            this.sendCommand(connection, `${msg.number} ${msg.size}`);
          });
        }
        this.sendCommand(connection, '.');
      }
    });
  }

  private async commandRSET(connection: POP3Connection, args: string[]): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state !== 'transaction') {
      this.sendCommand(connection, '-ERR Command not valid in current state');
      return;
    }

    const messageNumber = args.length > 0 ? parseInt(args[0], 10) : null;

    this.emit('LIST', connection, messageNumber, (messages: Array<{ number: number, size: number }> | null) => {
      if (messageNumber !== null) {
        const message = messages?.[0];
        if (message) {
          this.sendCommand(connection, `+OK ${message.number} ${message.size}`);
        } else {
          this.sendCommand(connection, '-ERR No such message');
        }
      } else {
        this.sendCommand(connection, `+OK Scan listing follows`);
        if (messages) {
          messages.forEach(msg => {
            this.sendCommand(connection, `${msg.number} ${msg.size}`);
          });
        }
        this.sendCommand(connection, '.');
      }
    });
  }

  private async commandQUIT(connection: POP3Connection): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state === 'transaction') {
      connectInfo.state = 'update';
      await this.storage.set(connection.id, connectInfo);

      this.emit('QUIT', connection, () => {
        this.sendCommand(connection, '+OK POP3 server signing off');
        this.closeConnection(connection, 'Client logout');
      });
    } else {
      this.sendCommand(connection, '+OK POP3 server signing off');
      this.closeConnection(connection, 'Client logout');
    }
  }

  private async commandUIDL(connection: POP3Connection, args): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state === 'transaction') {
      connectInfo.state = 'update';
      await this.storage.set(connection.id, connectInfo);

      this.emit('QUIT', connection, () => {
        this.sendCommand(connection, '+OK POP3 server signing off');
        this.closeConnection(connection, 'Client logout');
      });
    } else {
      this.sendCommand(connection, '+OK POP3 server signing off');
      this.closeConnection(connection, 'Client logout');
    }
  }

  private async commandTOP(connection: POP3Connection, args): Promise<void> {
    const connectInfo = await this.storage.get(connection.id);

    if (connectInfo.state === 'transaction') {
      // Cập nhật trạng thái và lưu các email đã đánh dấu xóa
      connectInfo.state = 'update';
      await this.storage.set(connection.id, connectInfo);

      this.emit('QUIT', connection, () => {
        this.sendCommand(connection, '+OK POP3 server signing off');
        this.closeConnection(connection, 'Client logout');
      });
    } else {
      this.sendCommand(connection, '+OK POP3 server signing off');
      this.closeConnection(connection, 'Client logout');
    }
  }

  private async commandCAPA(connection: POP3Connection): Promise<void> {
    const capabilities = [
      'USER',
      'PIPELINING',
      'TOP',
      'UIDL',
      'RESP-CODES'
    ];

    if (this.config.TLSOptions.enable) {
      capabilities.push('STLS');
    }

    this.sendCommand(connection, '+OK Capability list follows');
    capabilities.forEach(cap => {
      this.sendCommand(connection, cap);
    });
    this.sendCommand(connection, '.');
  }

}
