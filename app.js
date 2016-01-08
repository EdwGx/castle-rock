var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var port = process.env.PORT || 8080;

app.get('/', function(req, res){
  res.send('<h1>Hello world</h1>');
});

app.listen(port, function() {
    console.log('App is running on http://localhost:' + port);
});
