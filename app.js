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
    'mongodb://localhost/Markets3';
var theport = process.env.PORT || 2500;

app.use('/', express.static(__dirname + '/public'));

var WDC_Market_url = 'http://pubapi.cryptsy.com/api.php?method=singlemarketdata&marketid=14';
mongoose.connect(uristring, function(err){if(err) console.log(err);});
//var allURL = 'http://pubapi.cryptsy.com/api.php?method=marketdatav2';

var OneMinCandleSchema = mongoose.Schema({
    marketid: Number,
    time: Date,
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
    var APIfuckUpCount = 0;
    setInterval(function(){
        console.log('running GET '+ new Date().toLocaleTimeString());
        http.get(WDC_Market_url, function(res) {
            console.log('got response '+ new Date().toLocaleTimeString());

            // Buffer the body entirely for processing as a whole.
            var bodyChunks = [];
            res.on('data', function(chunk){bodyChunks.push(chunk);}).on('end', function() {
                var body = Buffer.concat(bodyChunks);
                try {
                    var data = JSON.parse(body);
                    var dataPresent = data.return;
                    if (dataPresent) {
                        APIfuckUpCount = 0;
                        var name = data.return.markets;
                        for (var key in name) {
                            //TODO: emit new trades to sockets
                            /*var callback = function(mID, data){
                                console.log("emitting to sockets in MID" + mID);
                                io.sockets.in(mID).emit('newTrades', {trades: data});
                            };*/
                            parseTrades(name[key]);
                        }
                    }
                    else
                        console.log("API Fuck up. Count = " + ++APIfuckUpCount);
                }
                catch(e) {
                    console.log("API Fuck up. Count = " + ++APIfuckUpCount);
                    if (e instanceof SyntaxError){
                        console.log("502 Bad Gateway");
                    }
                    else
                        console.log('caught error: '+ e);
                }
            })
        });

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

var parseTrades = function(data){
    var mID = parseInt(data.marketid);
    var trades = data.recenttrades;
    trades.sort(function(a, b){
        return a.id - b.id;
    });

    var numTrades = trades.length;
    if (numTrades > 0) {
        MinCandles.findOne({'marketid':mID}).sort('-tradeid').exec(function(err, lastCandle){
            //Attempt to find the most recent candle for this marketID.
            if(err) console.log(err);

            if (lastCandle) {
                console.log('found existing ' + mID + 'candles');
                //not the first time this market is being updated
            }

            else {
                console.log("first mID = "+ mID+" ever.");
                //first time ever for this market
            }
        });
    }
};

function formatCandles(mID, interval, trades, heldPrice) {
    // Note: maintain all date vars as getTime() timestamps
    // Note: assume trades are sorted, that trades[0] is the oldest
    var currentDateStamp = new Date(Math.floor(new Date(trades[0].time).getTime()/MINUTE)*MINUTE).getTime();
    var nextDateStamp = new Date(currentDateStamp + interval).getTime();

    var returnable = [];
    var currentSet = [];
    var volume = 0;

    var numTrades = trades.length;
    for (var i = 0; i < numTrades; i++) {
        var tradeTimeStamp = new Date(trades[i].time).getTime();

        if (tradeTimeStamp < nextDateStamp) {
            // current trade iterate belongs to current set
            currentSet.push(parseFloat(trades[i].price));
            volume += parseFloat(trades[i].quantity);
        }

        else {
            // close the current set and add current iterate to a new one
            var open, close, low, high;
            if (currentSet.length > 0) {
                open = currentSet[0];
                close = currentSet[currentSet.length-1];
                high = Math.max.apply( Math, currentSet);
                low = Math.min.apply(Math, currentSet);
            }
            else {
                // note: for a new mID, this should not be hit on i = 0, since the start time of the
                // first current set is set such that trades[0] gets placed there.
                open = heldPrice;
                close = heldPrice;
                high = heldPrice;
                low = heldPrice;
            }
            returnable.push({
                "volume":volume,
                "marketid": mID,
                "high":high,
                "low":low,
                "open":open,
                "close":close,
                "date":currentDateStamp
            });
            //clean up
            currentSet = [];
            volume = 0;
            //set up for next set
            heldPrice = close;
            currentDateStamp += interval;
            nextDateStamp += interval;

            //loop forward in time until current iterate is placed
            var placed = false;
            while (!placed) {
                console.log("while");
                if (tradeTimeStamp < nextDateStamp) {
                    currentSet.push(parseFloat(trades[i].price));
                    volume += parseFloat(trades[i].quantity);
                    placed = true;
                }
                else {
                    returnable.push({
                        "volume":volume,
                        "marketid": mID,
                        "high":heldPrice,
                        "low":heldPrice,
                        "open":heldPrice,
                        "close":heldPrice,
                        "date":currentDateStamp
                    });
                    currentDateStamp += interval;
                    nextDateStamp += interval;
                }
            }
        }
    }
    if (currentSet.length > 0) {
        //Push the last current set.
        open = currentSet[0];
        close = currentSet[currentSet.length-1];
        high = Math.max.apply( Math, currentSet);
        low = Math.min.apply(Math, currentSet);
        returnable.push({
            "volume":volume,
            "marketid": mID,
            "high":high,
            "low":low,
            "open":open,
            "close":close,
            "date":currentDateStamp
        });
    }
    //All given trades were formatted to minCandles
    return(returnable);
}