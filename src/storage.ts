import { IConnectInfo } from "./interface";
import * as console from "node:console";

export default class Storage {
  private readonly connection: Map<string, IConnectInfo>

  constructor() {
    this.connection = new Map();
  }

  async get(key: string) {
    return this.connection.get(key);
  }

  async set(key: string, connection: IConnectInfo) {
    this.connection.set(key, connection);
  }

  async destroy(key: string) {
    this.connection.delete(key);
  }

  async list() {
    return this.connection;
  }
}
