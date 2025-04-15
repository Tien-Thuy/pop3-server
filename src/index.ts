import POP3Server from './pop3'
import * as dns from "node:dns";

const poP3Server = new POP3Server({
  port: 8110,
  host: '127.0.0.1',
  TLSOptions: {
    enable: false
  }
})

poP3Server.start();

poP3Server.on('LOGIN', (user) => {
  console.log(`User logged in`, user);
  user.auth(true);
});
