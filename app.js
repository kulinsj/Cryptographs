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
    'mongodb://localhost/Markets13';
var theport = process.env.PORT || 2500;

app.use('/', express.static(__dirname + '/public'));

mongoose.connect(uristring, function(err){if(err) console.log(err);});
var allCryptsyURL = 'http://pubapi.cryptsy.com/api.php?method=marketdatav2';

var OneMinCandleSchema = mongoose.Schema({
    marketid: Number,
    time: Date,
    open: Number,
    close: Number,
    high: Number,
    low: Number,
    volume: Number,
    lastTradeID: Number
});

var MinCandles = mongoose.model('MinCandles', OneMinCandleSchema);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.on('open', function callback(){
    console.log('connected to mongoose');
    var APIfuckUpCount = 0;
    var timeoutCount = 0;
    setInterval(function(){
        console.log('running GET '+ new Date().toLocaleTimeString());
        http.get(allCryptsyURL, function(res) {
            console.log('got response '+ new Date().toLocaleTimeString());

            // Buffer the body entirely for processing as a whole.
            var bodyChunks = [];
            res.on('data', function(chunk){
                bodyChunks.push(chunk);
            }).on('end', function() {
                var timeoutCount = 0;
                var body = Buffer.concat(bodyChunks);
                try {
                    var data = JSON.parse(body);
                    var dataPresent = data.return;
                    if (dataPresent) {
                        APIfuckUpCount = 0;
                        var name = data.return.markets;

                        for (var key in name) {
//                                TODO: emit new trades to sockets
//                                var callback = function(mID, data){
//                                    console.log("emitting to sockets in MID" + mID);
//                                    io.sockets.in(mID).emit('newTrades', {trades: data});
//                                };
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
        }).on('timeout', function(){
            var loudString = new Array(++timeoutCount).join("!");
            console.log("Timed out. Reset the router " + loudString );
        }).on('error', function(){
            console.log("error");
        }).setTimeout( 15000, function(){
            var loudString = new Array(++timeoutCount).join("!");
            console.log("Timed out. Reset the router " + loudString );
        });
    },30000);

    io.sockets.on('connection', function(socket){
        socket.on('ask', function(data){
            socket.join(data.marketid);
        });
        //TODO: send updates to sockets
    });

    app.get('/SingleMarket', function(req, res){
        var mID = req.query.mID;
        console.log('Client initial GET for market ' + mID);
        var Tminus5h;
        if (onServer) // adjust for silliness with heroku and cryptsy
            Tminus5h = new Date((new Date().getTime())-7*60*60*1000);
        else
            Tminus5h = new Date((new Date().getTime())-2*60*60*1000);
        MinCandles.find({marketid:mID}).where('time').gt(Tminus5h).exec(function(err, candles){
            res.end(JSON.stringify(candles));
        });
    } );

    server.listen(theport);
    console.log("Listening on port "+ theport);
});

function parseTrades(data){
    var mID = parseInt(data.marketid);

    var test = (mID == 14);

    var trades = data.recenttrades;
    trades.sort(function(a, b){
        return a.id - b.id;
    });

    var numTrades = trades.length;
    if (numTrades > 0) {
        MinCandles.findOne({'marketid':mID}).sort('-time').exec(function(err, lastCandle){
            //Attempt to find the most recent candle for this marketID.
            if(err) console.log(err);

            if (lastCandle) {
                //not the first time this market is being updated
                var earliestUsefulID = lastCandle.lastTradeID;
                if (parseInt(trades[numTrades-1].id) == lastCandle.lastTradeID) {
                    trades = []; // no new trades
                }
                else if ((parseInt(trades[0].id) < earliestUsefulID)) {
                    //something useful, but need to trim
                    for (var i = 0; i < numTrades; i++) {
                        if (parseInt(trades[i].id) > earliestUsefulID ) {
                            trades = trades.slice(i);
                            break;
                        }
                    }
                }
                numTrades = trades.length;
                if (numTrades > 0) {
                    //console.log("Time Zone Offset = " + new Date(trades[0].time).getTimezoneOffset());
                    //console.log("Trade 0 id = " + trades[0].id + " and time = "+trades[0].time + "  TS= "+ new Date(trades[0].time).getTime());
                    var newCandles = formatCandles(mID, MINUTE, trades, lastCandle.close);
                    if (new Date(newCandles[0].time).getTime() == new Date(lastCandle.time).getTime()) {
                        //first new candle needs to be merged
                        lastCandle.low = Math.min(lastCandle.low, newCandles[0].low);
                        lastCandle.high = Math.max(lastCandle.high, newCandles[0].high);
                        lastCandle.volume = lastCandle.volume + newCandles[0].volume;
                        lastCandle.lastTradeID = newCandles[0].lastTradeID;
                        lastCandle.save(function(err){
                            if (err) console.log("Error updating existing lastCandle");
                        });
                        if (test) {
                            console.log("pre trim");
                            console.log(newCandles);
                        }
                        if (newCandles.length > 1) {
                            newCandles = newCandles.slice(1);

                            if (test) {
                                console.log("post trim");
                                console.log(newCandles);
                            }

                            MinCandles.create(newCandles, function(err){
                                if (err) console.log("Error "+ err);
                                //else console.log("saved "+ newCandles.length +" new candles for mID "+ mID + " with merge");
                            });
                        }
                    }
                    else {
                        var startDateStamp = new Date(lastCandle.time).getTime() + MINUTE;
                        var endDateStamp = new Date(newCandles[0].time).getTime() - MINUTE;

                        var fillerCount = 0;
                        if (endDateStamp >= startDateStamp) {
                            //need to fill the gap in the data
                            var gapFillerCandles = [];
                            var heldPrice = lastCandle.close;
                            for (var t = startDateStamp; t <= endDateStamp; t += MINUTE) {
                                fillerCount++;
                                gapFillerCandles.push({
                                    "volume":0,
                                    "marketid": mID,
                                    "high":heldPrice,
                                    "low":heldPrice,
                                    "open":heldPrice,
                                    "close":heldPrice,
                                    "time":new Date(t),
                                    "lastTradeID":lastCandle.lastTradeID
                                });

                            }
                        }
                        if (fillerCount > 0)
                            newCandles = gapFillerCandles.concat(newCandles);
                        MinCandles.create(newCandles, function(err){
                            if (err) console.log("Error "+ err);
                            //else console.log("saved "+ newCandles.length +" new candles for mID "+ mID + " with "+fillerCount+" fillers");
                        });
                    }
                }
            }

            else {
                //first time ever for this market
                console.log("first mID = "+ mID+" ever.");
                var candles = formatCandles(mID, MINUTE, trades, null);

                MinCandles.create(candles, function(err){
                    if (err) console.log("Error "+ err);
                    else console.log("saved "+ candles.length +" new candles for mID "+ mID);
                });
            }
        });
    }
}

function formatCandles(mID, interval, trades, heldPrice){
    // Note: assume trades are sorted, that trades[0] is the oldest
    var currentDate = new Date(Math.floor(new Date(trades[0].time).getTime()/MINUTE)*MINUTE);
    // Note: only keep "nextDateStamp" as a stamp
    var nextDateStamp = new Date(currentDate.getTime() + interval).getTime();

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
                "time":currentDate,
                "lastTradeID":parseInt(trades[i-1].id)
            });
            //clean up
            currentSet = [];
            volume = 0;
            //set up for next set
            heldPrice = close;
            currentDate = new Date(currentDate.getTime() + interval);
            nextDateStamp += interval;

            //loop forward in time until current iterate is placed
            var placed = false;
            while (!placed) {
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
                        "time":currentDate,
                        "lastTradeID":parseInt(trades[i-1].id)
                    });
                    currentDate = new Date(currentDate.getTime() + interval);
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
            "time":currentDate,
            "lastTradeID":parseInt(trades[numTrades-1].id)
        });
    }
    //All given trades were formatted to minCandles
    return(returnable);
}