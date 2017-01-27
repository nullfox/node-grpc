import GRPC from 'grpc';
import express from 'express';
import BodyParser from 'body-parser';

const proto = GRPC.load(`${__dirname}/service.proto`);

// Datastore
const books = [{
  id: 1,
  author: 'Jack Kerouac',
  title: 'On the Road',
}, {
  id: 2,
  author: 'Gary Paulsen',
  title: 'The Hatchet',
}];

// GRPC Server
const grpcServer = new GRPC.Server();

grpcServer.addProtoService(proto.books.BookService.service, {
  list: (call, callback) => {
    call.request.page = call.request.page || 1;
    call.request.limit = call.request.limit || 50;

    const start = (call.request.page - 1) * call.request.limit;
    const end = start + call.request.limit;

    callback(null, books.slice(start, end));
  },
  get: (call, callback) => {
    const book = books.filter(b => b.id === call.request.id).shift();

    callback(!book ? { code: GRPC.status.NOT_FOUND } : null, book || null);
  },
  insert: (call, callback) => {
    const book = call.request;

    books.push(book);

    callback(null, book);
  },
  watch: (call) => {
    let index = 0;

    const interval = setInterval(() => {
      const book = books[index];

      if (book) {
        call.write(book);

        index += 1;
      } else {
        clearInterval(interval);

        call.end();
      }
    }, 3000);
  },
});

grpcServer.bind('0.0.0.0:50051', GRPC.ServerCredentials.createInsecure());
grpcServer.start();

// GRPC Client
const client = new proto.books.BookService('0.0.0.0:50051', GRPC.credentials.createInsecure());

// Test the GRPC Client
client.list({}, console.log);

// HTTP Server
const httpServer = express();
httpServer.use(BodyParser.json());

proto.books.BookService.service.children.forEach((rpc) => {
  // If the RPC method doesn't have options, it certainly isn't HTTP-able
  if (!rpc.options) {
    return false;
  }

  const options = Object.keys(rpc.options);
  const index = options.findIndex(k => /\(google.api.http\).get|post|put|delete|match/.test(k));

  // If the RPC method doesn't have an option matching (google.api.http).$method then skip it
  if (index === -1) {
    return false;
  }

  const method = options[index].split('.').pop();
  const path = rpc.options[options[index]];

  const rpcMethod = rpc.name[0].toLowerCase() + rpc.name.slice(1);

  // If it's not streaming, add an endpoint that just returns
  if (!rpc.responseStream) {
    return httpServer[method](path, (req, res) => {
      client[rpcMethod](Object.assign({}, req.params, req.query, req.body), (error, response) => {
        res.json(response);
      });
    });
  }

  // If its streaming, write it to the response in chunks as received
  return httpServer[method](path, (req, res) => {
    const stream = client[rpcMethod](Object.assign({}, req.params, req.query, req.body));

    stream.on('data', (data) => {
      res.write(JSON.stringify(data));
    });

    stream.on('end', () => {
      res.end();
    });
  });
});

// Start up the server on ol 3000
httpServer.listen('3000', () => {
  console.log('Server up breed');
});

// Run this in succession for maximum magic
// curl -X GET http://127.0.0.1:3000/v1/books | jq
// curl -X POST -H 'Content-Type: application/json' -d '{"id":5,"title":"The Odyssey","author":"Homer"}' http://127.0.0.1:3000/v1/books | jq
// curl -X GET http://127.0.0.1:3000/v1/books | jq
// curl -X GET -N http://127.0.0.1:3000/v1/books-stream
