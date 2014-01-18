var mongoose = require('mongoose');
var http = require('http');
var jsdom = require('jsdom');
var window = jsdom.jsdom().createWindow();
var jquery = require('jquery')(window);

var NETurl = 'http://pubapi.cryptsy.com/api.php?method=singlemarketdata&marketid=134';
mongoose.connect('mongodb://localhost/Markets');

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

    var data;
	var req = http.get(NETurl, function(res) {
		//console.log('STATUS: ' + res.statusCode);
		//console.log('HEADERS: ' + JSON.stringify(res.headers));

		// Buffer the body entirely for processing as a whole.
		var bodyChunks = [];
		res.on('data', function(chunk) {
			// You can process streamed parts here...
			bodyChunks.push(chunk);
		}).on('end', function() {
			var body = Buffer.concat(bodyChunks);
			data = JSON.parse(body);
			console.log(data);
			var name = data.return.markets;
			for (var key in name) {
				//thisMarket is one coin pair
				var thisMarket = name[key];
				//check DB for existence
				Market.findOne({'label':thisMarket.label}, function(err, foundMarket){
					if (err) console.log(err);
					if (foundMarket) {
						//update
						console.log('found market with label '+ thisMarket.label);
						
						var temp = new Market({
							recenttrades: thisMarket.recenttrades,
							buyorders: thisMarket.buyorders,
							sellorders: thisMarket.sellorders
						});

						var oldTrades = foundMarket.recenttrades;
						var newTrades = temp.recenttrades;
						jquery.merge(newTrades, oldTrades);

						var existingIDs = [];
						var mergedTrades = jquery.grep(newTrades, function(v) {
						    if (jquery.inArray(v.id, existingIDs) !== -1) {
						        return false;
						    }
						    else {
						        existingIDs.push(v.id);
						        return true;
						    }
						});
						mergedTrades.sort(function(a, b) {
						    var akey = a.id, bkey = b.id;
						    if(akey < bkey) return 1;
						    if(akey > bkey) return -1;
						    return 0;
						});

						var oldBuys = foundMarket.buyorders;
						var newBuys = temp.buyorders;
						//TODO: identify which orders are added/removed
						var oldSells = foundMarket.sellorders;
						var newSells = temp.sellorders;

						foundMarket.recenttrades = mergedTrades;
						foundMarket.sellorders = newSells;
						foundMarket.buyorders = newBuys;
						foundMarket.lasttradeprice = mergedTrades[0].price;
						foundMarket.save(function(err){
							if (err)
								console.log('failed to update: ' + err);
							else
								console.log('Updated Successfully');
						});

						// console.log("NEW");
						// console.log(newTrades);
						// console.log("OLD");
						// console.log(oldTrades);
						// console.log("MERGED");
						// console.log(mergedTrades);


					}
					else {
						//create new DB entry
						console.log("not found, creating new entry");

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
			//console.log('BODY: ' + body);
			// ...and/or process the entire body here.
		})
	});

	// 	http.createServer(function (request, response) {
	// 		response.writeHead(200, {'Content-Type': 'text/plain'});
	// 		response.end(data);
	// 	}).listen(8124);



	// });
	http.createServer(function (request, response) {
		response.writeHead(200, {'Content-Type': 'text/plain'});
		response.end(JSON.stringify(data));
	}).listen(8124);
});
