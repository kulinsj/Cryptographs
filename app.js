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

var MarketSchema = mongoose.Schema({
    	marketid: Number,
    	label: String,
    	lasttradeprice: Number,
    	volume: Number,
    	lasttradetime: Date,
		primaryname: String,
		primarycode: String,
		secondaryname: String,
		secondaryCode: String,
		recenttrades: [{
			id: Number,
	    	time: Date,
	    	price: Number,
	    	quantity: Number,
	    	total: Number
		}],
		sellorders: [{
			price: Number,
	    	quantity: Number,
	    	total: Number
		}],
		buyorders: [{
			price: Number,
	    	quantity: Number,
	    	total: Number
	    }]
    });
var Market = mongoose.model('Market', MarketSchema);

var TradeSchema = mongoose.Schema({
    marketid: Number,
    date: Date,
    price: Number,
    amount: Number,
    tradeid: Number
});

var Trades = mongoose.model('Trades', TradeSchema);

//TODO: Migrate to candle storage
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

    var waiting = false;
    setInterval(function(){
        if (!waiting) {
            waiting = true;
            var d = new Date();
            console.log('running GET '+ d.toLocaleTimeString());

            http.get(WDC_Market_url, function(res) {
                d = new Date();
                console.log('got response '+ d.toLocaleTimeString());
                waiting = false;
                // Buffer the body entirely for processing as a whole.
                var bodyChunks = [];
                res.on('data', function(chunk) {
                    // Process streamed parts here...
                    bodyChunks.push(chunk);
                }).on('end', function() {
                    var body = Buffer.concat(bodyChunks);
                    try {
                        var data = JSON.parse(body);
                        var name = data.return.markets;
                        for (var key in name) {
                            var callback = function(mID, data){
                                console.log("emitting to sockets in MID" + mID);
                                io.sockets.in(mID).emit('newTrades', {trades: data});
                            };
                            parseTrades(name[key], callback);
                        }
                    }
                    catch(e) {
                        console.log('caught error: '+e);
                    }
                    //console.log('BODY: ' + body);
                    // ...and/or process the entire body here.
                })
            });
        }
    }, 10000);

    io.sockets.on('connection', function(socket){

        socket.on('ask', function(data){
            var mID = data.marketid;
            socket.join(mID);
        });
    });

    app.get('/WDC', function(req, res){
        var callback = function(result) {
            res.end(JSON.stringify(result));
        };
        clientRequest(14, callback, parseInt(req.query.interval), parseInt(req.query.numIntervals));
    } );

    server.listen(theport);
    console.log("Listening on port "+ theport);
});

var formatCandlesticks = function(interval, numInterval, startDate, trades, heldPrice, mID) {
    var toSend = [];
    var currentDate = startDate;
    var nextDate = new Date(currentDate.getTime() + interval);
    var currentSet = [];
    var volume = 0;
    var length = trades.length;
    console.log("format candles. Given "+length+" trades. Held price = "+ heldPrice);
    for (var i = 0; i < length; i++) {
        //iterate through trades
        if (new Date(trades[i].time).getTime() < nextDate.getTime()) {
            currentSet.push(trades[i].price);
            volume += trades[i].quantity;
        }
        else {
            var open, close, low, high;
            if (currentSet.length > 0) {
                open = currentSet[0];
                close = currentSet[currentSet.length-1];
                high = Math.max.apply( Math, currentSet);
                low = Math.min.apply(Math, currentSet);
            }
            else {
                open = heldPrice;
                close = heldPrice;
                high = heldPrice;
                low = heldPrice;
            }
            toSend.push({
                "volume":volume,
                "marketid": mID,
                "high":high,
                "low":low,
                "open":open,
                "close":close,
                "date":currentDate.getTime()
            });
            currentSet = [];
            volume = 0;
            heldPrice = close;
            currentDate = new Date(currentDate.getTime() + interval);
            nextDate = new Date(nextDate.getTime() + interval);
            var placed = false;
            while (!placed) {
                if (new Date(trades[i].time).getTime() < nextDate.getTime()) {
                    currentSet.push(trades[i].price);
                    volume += trades[i].quantity;
                    placed = true;
                }
                else {
                    toSend.push({
                        "volume":volume,
                        "marketid": mID,
                        "high":heldPrice,
                        "low":heldPrice,
                        "open":heldPrice,
                        "close":heldPrice,
                        "date":currentDate.getTime()
                    });
                    currentDate = new Date(currentDate.getTime() + interval);
                    nextDate = new Date(nextDate.getTime() + interval);
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
        toSend.push({
            "volume":volume,
            "marketid": mID,
            "high":high,
            "low":low,
            "open":open,
            "close":close,
            "date":currentDate.getTime()
        });
    }
    //should be done here.
    while (toSend.length < numInterval) {
        console.log("YO BITCH, THIS SHOULDN'T BE HIT");
        toSend.push({
            "volume":0,
            "marketid": mID,
            "high":heldPrice,
            "low":heldPrice,
            "open":heldPrice,
            "close":heldPrice,
            "date":currentDate.getTime()
        });
        currentDate = new Date(currentDate.getTime() + interval);
        nextDate = new Date(nextDate.getTime() + interval);
    }
    return (toSend);
}

var parseTrades = function(data, callback){
    var mID = data.marketid;
    var trades = data.recenttrades;

    trades.sort(function(a, b){
        return a.id - b.id;
    });

    var length = trades.length;

    if (length > 0) {
        MinCandles.findOne({'marketid':mID}).sort('-tradeid').exec(function(err, lastCandle){
            if(err) console.log(err);
            if (lastCandle) {
                console.log("original trades length = " + length);
                var earliestUseful = lastCandle.date;
                for (var i = 0; i < length; i++) {
                    if (new Date(trades[i].time).getTime() >= earliestUseful ) {
                        trades = trades.slice(i);
                        break;
                    }
                }
                length = trades.length;
                console.log("trimmed trades length = " + length);

                var numIntervals = getNumIntervalsForTrades(trades, MINUTE);
                var heldPrice = lastCandle.close;

                var newCandles = formatCandlesticks(MINUTE, numIntervals, new Date(earliestUseful), trades, heldPrice, mID);
                console.log(newCandles);
                console.log("First new Candle = " + newCandles[0]);
                console.log("Last old Candle = " + lastCandle);
            }
            else {
                console.log('no candles found');
                //just start saving new ones

                //round the earliest trade down to the nearest minute
                var startDate = new Date(Math.floor(new Date(trades[0].time).getTime()/MINUTE)*MINUTE);

                var numInterval = getNumIntervalsForTrades(trades, MINUTE);

                var candles = formatCandlesticks(MINUTE, numInterval, startDate, trades, trades[0].price, mID);

//                MinCandles.create(candles, function(err){
//                    if (err) console.log("Error "+ err);
//                    else console.log("saved "+ candles.length +"new candles for mID "+ mID);
//                });
            }
        });
    }









    Trades.findOne({'marketid':mID}).sort('-tradeid').exec(function(err, lastTrade){
        if(err)
            console.log(err);
        var newLeanTrades = [];
        if (lastTrade) {
            var stopID = lastTrade.tradeid;
            for (var i = 0; i < trades.length; i++) {
                if (trades[i].id > stopID) {
                    var date1 = new Date(trades[i].time).getTime();
                    if (onServer){
                        //Adjust by 5 hours for time offset b/w Cryptsy and Heroku
                        date1 = new Date(new Date(trades[i].time).getTime()+ 18000000).getTime();
                    }
                    newLeanTrades.push({
                        "marketid":mID,
                        "price":trades[i].price,
                        "date":date1,
                        "amount":trades[i].total,
                        "tradeid":trades[i].id
                    });
                }
                else
                    break;
            }
            //console.log("# of new = "+ newLeanTrades.length);
            if (newLeanTrades.length > 0) {
                Trades.create(newLeanTrades, function(err){
                    if (err)
                        console.log("Error "+ err);
                    else {
                        console.log("saved "+ newLeanTrades.length +" new trades for mID "+ mID);
                        callback(mID, newLeanTrades);
                    }
                });
            }
            else
                console.log("No new trades");
        }
        else {
            console.log("nothing found");
            for (var i = 0; i < trades.length; i++) {
                var date = new Date(trades[i].time).getTime();
                if (onServer){
                    //Adjust by 5 hours for time offset b/w Cryptsy and Heroku
                    date = new Date(new Date(trades[i].time).getTime()+ 18000000).getTime();
                }
                newLeanTrades.push({
                    "marketid":mID,
                    "price":trades[i].price,
                    "date":date,
                    "amount":trades[i].total,
                    "tradeid":trades[i].id
                });
            }
            //console.log("# of new = "+ newLeanTrades.length);
            Trades.create(newLeanTrades, function(err){
                if (err) console.log("Error "+ err);
                else console.log("saved "+ newLeanTrades.length +"new trades for mID "+ mID);
            });
        }
    });
}

var getNumIntervalsForTrades = function (trades, interval) {
    //round the earliest trade down to the nearest minute
    var startDate = new Date(Math.floor(new Date(trades[0].time).getTime()/interval)*interval);
    //round latest trade up to the nearest minute
    var endDate = new Date(Math.ceil(new Date(trades[trades.length -1].time).getTime()/interval)*interval);
    return (endDate.getTime() - startDate.getTime())/interval;
}

var runUpdate = function (thisMarket) {
    Market.findOne({'label':thisMarket.label}, function(err, foundMarket){
        if (err) console.log(err);
        if (foundMarket) {
            //update
            var temp = new Market({
                recenttrades: thisMarket.recenttrades,
                buyorders: thisMarket.buyorders,
                sellorders: thisMarket.sellorders
            });

            var oldTrades = foundMarket.recenttrades;
            var newTrades = temp.recenttrades;
            var dupeMerge = oldTrades.concat(newTrades);

            var existingIDs = [];
            var merged = [];
            for (var ind in dupeMerge) {
                var id = dupeMerge[ind].id;
                if (existingIDs.indexOf(id)==-1){
                    existingIDs.push(id);
                    merged.push(dupeMerge[ind]);
                }
            }
            merged.sort(function(a, b) {
                var akey = a.time, bkey = b.time;
                if(akey < bkey) return 1;
                if(akey > bkey) return -1;
                return 0;
            });
            var newCount = merged.length - oldTrades.length;
            if (newCount > 0)
                console.log(newCount + " new trade(s) for " + foundMarket.label);

            var oldBuys = foundMarket.buyorders;
            var newBuys = temp.buyorders;
            //TODO: identify which orders are added/removed
            var oldSells = foundMarket.sellorders;
            var newSells = temp.sellorders;

            foundMarket.recenttrades = merged;
            foundMarket.sellorders = newSells;
            foundMarket.buyorders = newBuys;
            foundMarket.lasttradeprice = merged[0].price;
            foundMarket.save(function(err){
                if (err) console.log('failed to update: ' + err);
            });
        }
        else {
            //create new DB entry
            console.log(thisMarket.label + " not found, creating new entry");

            var toSave = new Market({
                marketid: thisMarket.marketid,
                label: thisMarket.label,
                lasttradeprice: thisMarket.lasttradeprice,
                volume: thisMarket.volume,
                lasttradetime: thisMarket.lasttradetime,
                primaryname: thisMarket.primaryname,
                primarycode: thisMarket.primarycode,
                secondaryname: thisMarket.secondaryname,
                secondaryCode: thisMarket.secondaryCode,
                recenttrades: thisMarket.recenttrades,
                buyorders: thisMarket.buyorders,
                sellorders: thisMarket.sellorders
            });
            toSave.save(function(err){
                if (err)
                    console.log('failed to save: ' + err);
                else
                    console.log('saved new market');
            });
        }
    });
}

function clientRequest(mID, callable, timeInterval, numberIntervals) {
    var now = new Date();
    var start = new Date(now - timeInterval*numberIntervals);
    var roundedStart = new Date(Math.floor(start.getTime()/timeInterval)*timeInterval);
    Trades.find({'marketid':mID, 'date':{$gt: roundedStart }}, function (err, trades){
        if (trades){
            trades.sort(function(a, b){
                return a.tradeid - b.tradeid;
            });
            //to fill in open/close etc if the earliest interval has no trades,
            //query the database for the most recent trade before the earliest interval and use its price
            Trades.findOne({'marketid':mID, 'date':{$lt: roundedStart}}).sort('-tradeid').exec(function(err, lastTrade){
                if(lastTrade) {
                    callable(formatCandlesticks(timeInterval, numberIntervals, roundedStart, trades, lastTrade.price, mID));
                }
                else {
                    callable('reaching too far back');
                    //todo: handle notifying client how many intervals will actually be sent
                }
            });
        }
        else {
            callable('no trades found');
        }
    });
}
