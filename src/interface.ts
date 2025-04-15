import net from "node:net";
import tls from "node:tls";

export interface POP3ServerEvents {
  connect: (event: {
    id: string;
    remoteAddress: string;
    secure: boolean
  }) => void;
  close: () => void;
  data: (event: {
    connection: POP3Connection;
    data: Buffer;
  }) => void;
  timeout: (event: POP3Connection) => void;
  listening: (info: {
    address: string;
    port: number;
    secure: boolean
  }) => void;
  error: (error: Error) => void;
  command: (event: { connection: POP3Connection, command: string, args: string[] }) => void;

  LOGIN: (event: {
    connection: POP3Connection;
    username: string;
    password: string;
    auth: (success: boolean) => void;
  }) => void; // POP3 chỉ cần kiểm tra xác thực qua USER và PASS
  QUIT: (connection: POP3Connection, func: Function) => void; // POP3 cần xử lý khi client gửi lệnh QUIT
  STAT: (connection: POP3Connection, callback: (messageCount: number, totalSize: number) => void) => void; // Lấy số lượng email và dung lượng
  LIST: (connection: POP3Connection, messageNumber: number | null, callback: (messages: { number: number; size: number }[] | null) => void) => void; // Liệt kê thông tin email hoặc một email cụ thể
  RETR: (connection: POP3Connection, messageNumber: number, callback: (content: string) => void) => void; // Tải nội dung một email
  DELE: (connection: POP3Connection, messageNumber: number) => void; // Đánh dấu email để xóa
  NOOP: (connection: POP3Connection) => void; // Không hoạt động, giữ kết nối
  RSET: (connection: POP3Connection) => void; // Hủy trạng thái "đánh dấu xóa" của tất cả email trong phiên hiện tại
  CAPA: (connection: POP3Connection, callback: (capabilities: string[]) => void) => void; // Trả về danh sách khả năng hỗ trợ của server
  TOP: (connection: POP3Connection, messageNumber: number, lines: number, callback: (headers: string, body: string | null) => void) => void; // Lấy thông tin header và một phần nội dung
  UIDL: (connection: POP3Connection, messageNumber: number | null, callback: (uniqueIDs: { number: number; uid: string }[] | null) => void) => void; // Trả về danh sách UID của các email
}

export interface POP3ServerConfig {
  host: string;
  port: number;
  welcomeMessage?: string;
  TLSOptions: {
    enable: boolean;
    key?: string;
    cert?: string;
    ca?: string;
  },
  idleTimeout?: number;
  maxConnections?: number;
  idLength?: number;
  storage?: IStorage;
}

export interface IStorage {
  get: (key: string) => Promise<IConnectInfo | undefined>;
  set: (key: string, value: IConnectInfo) => Promise<void>;
  destroy: (key: string) => Promise<void>;
  list: () => Promise<Map<string, IConnectInfo>>;
}

export interface IConnectInfo {
  state: 'authorization' | 'transaction' | 'update';
  user?: string;
  selectedMailbox?: string;
  secure: boolean;
}

export interface POP3Connection {
  id: string;
  socket: net.Socket | tls.TLSSocket;
}
