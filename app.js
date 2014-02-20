var mongoose = require('mongoose');
var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, { log: false });

var MINUTE = 60000;

var onServer;
onServer = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL;
console.log(onServer?"On Server":"On local");

var uristring =
    process.env.MONGOLAB_URI ||
    process.env.MONGOHQ_URL ||
    'mongodb://localhost/Markets2';
var theport = process.env.PORT || 2500;

app.use('/', express.static(__dirname + '/public'));

var WDC_Market_url = 'http://pubapi.cryptsy.com/api.php?method=singlemarketdata&marketid=14';
mongoose.connect(uristring, function(err){if(err) console.log(err);});
//var allURL = 'http://pubapi.cryptsy.com/api.php?method=marketdatav2';

var OneMinCandleSchema = mongoose.Schema({
    marketid: Number,
    date: Date,
    open: Number,
    close: Number,
    high: Number,
    low: Number,
    volume: Number
});

var MinCandles = mongoose.model('MinCandles', OneMinCandleSchema);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.on('open', function callback(){
    console.log('connected to mongoose');

    setInterval(function(){

    },10000);

    io.sockets.on('connection', function(socket){
        socket.on('ask', function(data){
            socket.join(data.marketid);
        });
        //TODO: send updates to sockets
    });

    app.get('/WDC', function(req, res){
        res.end('check one');
        //TODO: provide initial data
        /*var callback = function(result) {
            res.end(JSON.stringify(result));
        };*/
    } );

    server.listen(theport);
    console.log("Listening on port "+ theport);
});

