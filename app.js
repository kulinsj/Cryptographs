var mongoose = require('mongoose');
var http = require('http');

var NETurl = 'http://pubapi.cryptsy.com/api.php?method=singlemarketdata&marketid=134';
mongoose.connect('mongodb://localhost/Markets');
var allURL = 'http://pubapi.cryptsy.com/api.php?method=marketdatav2';

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
            http.get(allURL, function(res) {
                waiting = false;
                // Buffer the body entirely for processing as a whole.
                var bodyChunks = [];
                res.on('data', function(chunk) {
                    // You can process streamed parts here...
                    bodyChunks.push(chunk);
                }).on('end', function() {
                    var body = Buffer.concat(bodyChunks);
                    try {
                        var data = JSON.parse(body);
                        var name = data.return.markets;
                        for (var key in name) {
                            runUpdate(name[key]);
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

	// 	http.createServer(function (request, response) {
	// 		response.writeHead(200, {'Content-Type': 'text/plain'});
	// 		response.end(data);
	// 	}).listen(8124);

	// });
	// http.createServer(function (request, response) {
	// 	response.writeHead(200, {'Content-Type': 'text/plain'});
	// 	response.end(JSON.stringify(data));
	// }).listen(8124);
});

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
                if (err)
                    console.log('failed to update: ' + err);
                //else
                    //console.log('Updated Successfully');
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