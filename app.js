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
