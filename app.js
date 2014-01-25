var mongoose = require('mongoose');
var http = require('http');
var express = require('express');
var app = express();
var onServer;
if (process.env.MONGOLAB_URI || process.env.MONGOHQ_URL)
    onServer = true;
else
    onServer = false;
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

//mongoose.connect(uristring, function(){
//    mongoose.connection.db.dropDatabase();
//    console.log("DROPPED");
//});

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
                            parseTrades(name[key]);
                            //runUpdate(name[key]);
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
    }, 20000);

//    app.get('/', function(request, response){
//        var timeInterval = 60000;
//        var intervalCount = 360;
//        var now = new Date();
//        var start = now.getTime()- timeInterval*(intervalCount+1);
//
//        Market.findOne({'label':'WDC/BTC'}, function(err, foundMarket){
//            //var toSend = formatDataToSend(foundMarket, 60000, 360);
//            response.send('Hello World');
//            response.end();
//        });
//    });

    app.get('/WDC', function(request, response){
        console.log("Got client request");
        var timeInterval = 60000;
        var numberIntervals = 100;
        var now = new Date();
        var start = new Date(now - timeInterval*numberIntervals);
        var roundedStart = new Date(Math.floor(start.getTime()/timeInterval)*timeInterval);
        Trades.find({'marketid':14, 'date':{$gt: roundedStart }}, function (err, trades){
            if (trades){
                trades.sort(function(a, b){
                    return a.tradeid - b.tradeid;
                });
                //to fill in open/close etc if the earliest interval has no trades,
                //query the database for the most recent trade before the earliest interval and use its price
                Trades.findOne({'marketid':14, 'date':{$lt: roundedStart}}).sort('-tradeid').exec(function(err, lastTrade){
                    if(lastTrade) {
                        var result = formatCandlesticks(timeInterval, numberIntervals, roundedStart, trades, lastTrade.price);
                        response.end(JSON.stringify(result));
                    }
                    else {
                        response.write("reaching too far back");
                        response.end();
                        //todo: handle notifying client how many intervals will actually be sent
                    }
                });
            }
            else {
                console.log("no trades found");
            }

        });
    });

    app.get('/helloData', function(request, response){
        response.send("All your base are belong to us.");
        response.end();
    });

    app.listen(theport);
});

var formatCandlesticks = function(interval, numInterval, startDate, trades, heldPrice) {
    var toSend = [];
    var currentDate = startDate;
    var nextDate = new Date(currentDate + interval);
    var currentSet = [];
    trades.sort(function(a, b){
        return a.tradeid - b.tradeid;
    });
    var length = trades.length;
    console.log("format candles. Found "+length+" trades. Held price = "+ heldPrice);
    for (var i = 0; i < length; i++) {
        //iterate through trades
        if (new Date(trades[i].date).getTime() < nextDate.getTime()) {
            currentSet.push(trades[i].price);
        }
        else {
            var open, close, low, high;
            if (currentSet.length > 0) {
                open = currentSet[0];
                close = currentSet[currentSet.length-1];
                high = Math.max.apply( Math, currentSet );
                low = Math.min.apply(Math, currentSet);
            }
            else {
                open = heldPrice;
                close = heldPrice;
                high = heldPrice;
                low = heldPrice;
            }
            toSend.push({
                "high":high,
                "low":low,
                "open":open,
                "close":close,
                "date":currentDate
            });
            currentSet = [];
            heldPrice = close;
            currentDate = new Date(currentDate.getTime() + interval);
            nextDate = new Date(nextDate.getTime() + interval);
            var placed = false;
            while (!placed) {
                if (new Date(trades[i].date).getTime() < nextDate.getTime()) {
                    currentSet.push(trades[i].price);
                    placed = true;
                }
                else {
                    toSend.push({
                        "high":heldPrice,
                        "low":heldPrice,
                        "open":heldPrice,
                        "close":heldPrice,
                        "date":currentDate
                    });
                    currentDate = new Date(currentDate.getTime() + interval);
                    nextDate = new Date(nextDate.getTime() + interval);
                }
            }
        }
    }
    //should be done here.
    while (toSend.length < 100) {
        toSend.push({
            "high":heldPrice,
            "low":heldPrice,
            "open":heldPrice,
            "close":heldPrice,
            "date":currentDate
        });
        currentDate = new Date(currentDate.getTime() + interval);
        nextDate = new Date(nextDate.getTime() + interval);
    }
    return (toSend);
}

var parseTrades = function(data){
    var mID = data.marketid;
    var trades = data.recenttrades;
    var test = -1;
    Trades.findOne({'marketid':mID}).sort('-tradeid').exec(function(err, lastTrade){
        if(err)
            console.log(err);
        var newLeanTrades = [];
        if (lastTrade) {
            var stopID = lastTrade.tradeid;
            for (var i = 0; i < trades.length; i++) {
                if (trades[i].id > stopID) {
                    test++;
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
