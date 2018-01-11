// ==================================
// Websocket Server Side Code 
// ==================================
//var async = require('async');
var path = require('path');

module.exports = function (g_options, fcw, logger) {
	var helper = require(path.join(__dirname, './helper.js'))(process.env.creds_filename, logger);
	var ws_server = {};
	var broadcast = null;
	var known_everything = {};
	var marbles_lib = null;
	var known_height = 0;
	var checkPeriodically = null;
	var enrollInterval = null;
	var async = require('async');

	var async2 = require('async');
	var mysql = require('mysql');
	var http = require('http');
	var sqlite3 = require('sqlite3').verbose();
	var db = new sqlite3.Database('database', function(err){
    console.log('--------------------------CONNECT INFORMATION-------------------------------------');
    if(err){
        console.error("database connection failed:" + err.stack);
        return;
    }
    console.log("database connection success!!!");
    console.log('---------------------------------------------------------------------------------\n\n');
	});
	var jsSHA=require('jssha');
	//--------------------------------------------------------
	// Setup WS Module
	//--------------------------------------------------------
	ws_server.setup = function (l_broadcast, l_marbles_lib) {
		broadcast = l_broadcast;
		marbles_lib = l_marbles_lib;

		// --- Keep Alive  --- //
		clearInterval(enrollInterval);
		enrollInterval = setInterval(function () {					//to avoid REQUEST_TIMEOUT errors we periodically re-enroll
			let enroll_options = helper.makeEnrollmentOptions(0);
			fcw.enroll(enroll_options, function (err, enrollObj2) {
				if (err == null) {
					//marbles_lib = require(path.join(__dirname, './marbles_cc_lib.js'))(enrollObj2, opts, fcw, logger);
				}
			});														//this seems to be safe 3/27/2017
		}, helper.getKeepAliveMs());								//timeout happens at 5 minutes, so this interval should be faster than that
	};

	// process web socket messages
	ws_server.process_msg = function (ws, data) {
		const channel = helper.getChannelId();
		const first_peer = helper.getFirstPeerName(channel);
		var options = {
			peer_urls: [helper.getPeersUrl(first_peer)],
			ws: ws,
			endorsed_hook: endorse_hook,
			ordered_hook: orderer_hook
		};
		if (marbles_lib === null) {
			logger.error('marbles lib is null...');				//can't run in this state
			return;
		}

		// create a new marble
		if (data.type === 'create') {
			logger.info('[ws] create marbles req');
			options.args = {
				color: data.color,
				size: data.size,
				marble_owner: data.username,
				owners_company: data.company,
				owner_id: data.owner_id,
				auth_company: process.env.marble_company,
			};

			marbles_lib.create_a_marble(options, function (err, resp) {
				if (err != null) send_err(err, data);
				else options.ws.send(JSON.stringify({ msg: 'tx_step', state: 'finished' }));
			});
		}

		// transfer a marble
		else if (data.type === 'transfer_marble') {
			logger.info('[ws] transferring req');
			options.args = {
				marble_id: data.id,
				owner_id: data.owner_id,
				auth_company: process.env.marble_company
			};

			marbles_lib.set_marble_owner(options, function (err, resp) {
				if (err != null) send_err(err, data);
				else options.ws.send(JSON.stringify({ msg: 'tx_step', state: 'finished' }));
			});
		}

		// delete marble
		else if (data.type === 'delete_marble') {
			logger.info('[ws] delete marble req');
			options.args = {
				marble_id: data.id,
				auth_company: process.env.marble_company
			};

			marbles_lib.delete_marble(options, function (err, resp) {
				if (err != null) send_err(err, data);
				else options.ws.send(JSON.stringify({ msg: 'tx_step', state: 'finished' }));
			});
		}

		// get all owners, marbles, & companies
		else if (data.type === 'read_everything') {
			logger.info('[ws] read everything req');
			ws_server.check_for_updates(ws);
		}

		// get history of marble
		else if (data.type === 'audit') {
			if (data.marble_id) {
				logger.info('[ws] audit history');
				options.args = {
					id: data.marble_id,
				};
				marbles_lib.get_history(options, function (err, resp) {
					if (err != null) send_err(err, resp);
					else options.ws.send(JSON.stringify({ msg: 'history', data: resp }));
				});
			}
		}

		// disable marble owner
		else if (data.type === 'disable_owner') {
			if (data.owner_id) {
				logger.info('[ws] disable owner');
				options.args = {
					owner_id: data.owner_id,
					auth_company: process.env.marble_company
				};
				marbles_lib.disable_owner(options, function (err, resp) {
					if (err != null) send_err(err, resp);
					else options.ws.send(JSON.stringify({ msg: 'tx_step', state: 'finished' }));
				});
			}
		}

		// create new account 
		if(data.type == 'create_account'){
        	console.log('----------------------------------Create Account!--------------------------------------');
        	var value=data.ac_id+data.ac_short_name+data.ac_status+data.term_date+data.inception_date+data.ac_region+data.ac_sub_region+data.cod_country_domicile+data.liq_method+data.contracting_entity+data.mgn_entity+data.ac_legal_name+data.manager_name+data.cod_ccy_base+data.long_name+data.mandate_id+data.client_id+data.custodian_name+data.sub_mandate_id+data.transfer_agent_name+data.trust_bank+data.re_trust_bank+data.last_updated_by+data.last_approved_by+data.last_update_date;
        	console.log("------FROM PAGE----"+value);
       		var sha=new jsSHA("SHA-256","TEXT");
        	sha.update(value);
        	var sha_value=sha.getHash("HEX");
        	console.log("SHA-VALUE: " + sha_value);
        	options.args = {
					type_: 'account',
					hash: sha_value
			};
        	db.serialize(function () {
            	//  Database#run(sql, [param, ...], [callback])

            	db.run('INSERT INTO account(sha_value, ac_id,ac_short_name,status,term_date,inception_date,ac_region,' +
                	'ac_sub_region,cod_country_domicile,liq_method,contracting_entity,mgn_entity,ac_legal_name,manager_name,' +
                	'cod_ccy_base,longname,mandate_id,client_id,custodian_name,sub_mandate_id,transfer_agent_name,trust_bank,' +
                	're_trust_bank,last_updated_by,last_approved_by,last_update_date) ' +
                	'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                	[sha_value, data.ac_id, data.ac_short_name, data.ac_status, data.term_date,
                    	data.inception_date, data.ac_region, data.ac_sub_region, data.cod_country_domicile, data.liq_method,
                    	data.contracting_entity, data.mgn_entity, data.ac_legal_name, data.manager_name, data.cod_ccy_base,
                    	data.long_name, data.mandate_id, data.client_id, data.custodian_name, data.sub_mandate_id,
                    	data.transfer_agent_name, data.trust_bank, data.re_trust_bank, data.last_updated_by,
                    	data.last_approved_by, data.last_update_date],

                	function(err){
                    	if(err){
                        	console.log('--------------------------FAIL INSERT Account----------------------------');
                        	console.log('[INSERT ERROR] - ',err.stack);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}else{
                        	console.log('--------------------------SUCCESS INSERT Account----------------------------');
                        	console.log('Last Inserted Row ID: ' + this.lastID);
                        	console.log('Number of Rows Affected: ' + this.changes);
                        	marbles_lib.create_account(options, function (err, resp) {
								if (err != null) send_err(err, resp);
								else options.ws.send(JSON.stringify({ msg: 'history', data: resp }));
							});
                        	// chaincode.invoke.create_account([data.ac_id, data.ac_short_name, data.ac_status, data.term_date,
                         //   		data.inception_date, data.ac_region, data.ac_sub_region, data.cod_country_domicile, data.liq_method,
                         //    	data.contracting_entity, data.mgn_entity, data.ac_legal_name, data.manager_name, data.cod_ccy_base,
                         //    	data.long_name, data.mandate_id, data.client_id, data.custodian_name, data.sub_mandate_id,
                         //    	data.transfer_agent_name, data.trust_bank, data.re_trust_bank, data.last_updated_by,
                         //    	data.last_approved_by, data.last_update_date, sha_value], cb_invoked);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}
                	});
        	});
    	}

    	// create new ac_trade
    	else if(data.type == 'ac_trade_setup'){
       		console.log('----------------------------------Create ac_trade!--------------------------------------');
        	var value=data.ac_id+data.lvts+data.calypso+data.aladdin+data.trade_start_date+data.equity+data.fixed_income;
       		console.log("------FROM PAGE----"+value);
        	var sha=new jsSHA("SHA-256","TEXT");
        	sha.update(value);
        	var sha_value=sha.getHash("HEX");
        	console.log("SHA-VALUE: " + sha_value);

        	options.args = {
					type_: 'ac_trade',
					hash: sha_value
			};

        	db.serialize(function () {
            	//  Database#run(sql, [param, ...], [callback])
            	db.run('INSERT INTO ac_trade(sha_value,ac_id,lvts,calypso,aladdin,trade_start_date,equity,fixed_income) ' +
					'VALUES(?,?,?,?,?,?,?,?)',[ sha_value, data.ac_id, data.lvts, data.calypso,
                    data.aladdin, data.trade_start_date, data.equity, data.fixed_income],

                	function(err){
                    	if(err){
                        	console.log('--------------------------FAIL INSERT Account----------------------------');
                        	console.log('[INSERT ERROR] - ',err.stack);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}else{
                        	console.log('--------------------------SUCCESS INSERT Account----------------------------');
                        	console.log('Last Inserted Row ID: ' + this.lastID);
                        	console.log('Number of Rows Affected: ' + this.changes);
                        	marbles_lib.create_ac_trade(options, function (err, resp) {
								if (err != null) send_err(err, resp);
								else options.ws.send(JSON.stringify({ msg: 'history', data: resp }));
							});
                        	// chaincode.invoke.ac_trade_setup([ data.ac_id, data.lvts, data.calypso,
                         //    	data.aladdin, data.trade_start_date, data.equity, data.fixed_income, sha_value], cb_invoked);
                        	console.log('--------------------------------------------------------------------\n\n');
                   		}
                	});
        	});
    	}

    	// crteate new ac_benchmark
    	else if(data.type == 'ac_benchmark'){
        	console.log('----------------------------------Create ac_benchmark!--------------------------------------');
        	var value=data.ac_id+data.benchmark_id+data.source+data.name+data.currency+data.primary_flag+data.start_date+data.end_date+data.benchmark_reference_id+data.benchmark_reference_id_source;
        	console.log("------FROM PAGE----"+value);
        	var sha=new jsSHA("SHA-256","TEXT");
        	sha.update(value);
        	var sha_value=sha.getHash("HEX");
        	console.log("SHA-VALUE: " + sha_value);

        	options.args = {
					type_: 'ac_benchmark',
					hash: sha_value
			};

        	db.serialize(function () {
            	//  Database#run(sql, [param, ...], [callback])
            	db.run('INSERT INTO ac_benchmark( sha_value,ac_id,benchmark_id,source,name,currency,primary_flag,' +
                	'start_date,end_date,benchmark_reference_id,benchmark_reference_id_source) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                	[sha_value, data.ac_id, data.benchmark_id, data.source, data.name,
                    	data.currency, data.primary_flag, data.start_date, data.end_date, data.benchmark_reference_id,
                    	data.benchmark_reference_id_source],
                	function(err){
                    	if(err){
                        	console.log('--------------------------FAIL INSERT Account----------------------------');
                        	console.log('[INSERT ERROR] - ',err.stack);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}else{
                       		console.log('--------------------------SUCCESS INSERT Account----------------------------');
                        	console.log('Last Inserted Row ID: ' + this.lastID);
                        	console.log('Number of Rows Affected: ' + this.changes);
                        	marbles_lib.create_ac_benchmark(options, function (err, resp) {
								if (err != null) send_err(err, resp);
								else options.ws.send(JSON.stringify({ msg: 'history', data: resp }));
							});
                        	// chaincode.invoke.ac_benchmark([data.ac_id, data.benchmark_id, data.source, data.name,
                         //    	data.currency, data.primary_flag, data.start_date, data.end_date, data.benchmark_reference_id,
                         //    	data.benchmark_reference_id_source, sha_value], cb_invoked);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}
                	});
        	});
    	}

    	//create new benchmarkss
    	else if(data.type == 'benchmarks'){
        	console.log('----------------------------------Create benchmarks!--------------------------------------');
        	var value=data.benchmark_id+data.id_source+data.name+data.currency+data.benchmark_reference_id+data.benchmark_reference_id_source;
        	console.log("------FROM PAGE-------");
        	var sha=new jsSHA("SHA-256","TEXT");
        	sha.update(value);
        	var sha_value=sha.getHash("HEX");
        	console.log("SHA-VALUE: " + sha_value);

        	options.args = {
					type_: 'benchmark',
					hash: sha_value
			};

        	db.serialize(function () {
            	//  Database#run(sql, [param, ...], [callback])
            	db.run('INSERT INTO benchmarks(sha_value,benchmark_id,id_source,name,currency,benchmark_reference_id,' +
                	'benchmark_reference_id_source) VALUES(?,?,?,?,?,?,?)',
                	[ sha_value, data.benchmark_id, data.id_source, data.name, data.currency,
                    	data.benchmark_reference_id, data.benchmark_reference_id_source],
                	function(err){
                    	if(err){
                        	console.log('--------------------------FAIL INSERT Account----------------------------');
                        	console.log('[INSERT ERROR] - ',err.stack);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}else{
                        	console.log('--------------------------SUCCESS INSERT Account----------------------------');
                        	console.log('Last Inserted Row ID: ' + this.lastID);
                        	console.log('Number of Rows Affected: ' + this.changes);
                        	marbles_lib.create_benchmark(options, function (err, resp) {
								if (err != null) send_err(err, resp);
								else options.ws.send(JSON.stringify({ msg: 'history', data: resp }));
							});
                        	// chaincode.invoke.benchmarks([data.benchmark_id, data.id_source, data.name, data.currency,
                         //    	data.benchmark_reference_id, data.benchmark_reference_id_source, sha_value], cb_invoked);
                        	console.log('--------------------------------------------------------------------\n\n');
                    	}
                	});
        	});
   		}

		// send transaction error msg 
		function send_err(msg, input) {
			sendMsg({ msg: 'tx_error', e: msg, input: input });
			sendMsg({ msg: 'tx_step', state: 'committing_failed' });
		}

		// send a message, socket might be closed...
		function sendMsg(json) {
			if (ws) {
				try {
					ws.send(JSON.stringify(json));
				}
				catch (e) {
					logger.debug('[ws error] could not send msg', e);
				}
			}
		}

		// endorsement stage callback
		function endorse_hook(err) {
			if (err) sendMsg({ msg: 'tx_step', state: 'endorsing_failed' });
			else sendMsg({ msg: 'tx_step', state: 'ordering' });
		}

		// ordering stage callback
		function orderer_hook(err) {
			if (err) sendMsg({ msg: 'tx_step', state: 'ordering_failed' });
			else sendMsg({ msg: 'tx_step', state: 'committing' });
		}
	};

	//------------------------------------------------------------------------------------------

	// sch next periodic check
	function sch_next_check() {
		clearTimeout(checkPeriodically);
		checkPeriodically = setTimeout(function () {
			try {
				ws_server.check_for_updates(null);
			}
			catch (e) {
				console.log('');
				logger.error('Error in sch next check\n\n', e);
				sch_next_check();
				ws_server.check_for_updates(null);
			}
		}, g_options.block_delay + 2000);
	}

	// --------------------------------------------------------
	// Check for Updates to Ledger
	// --------------------------------------------------------
	ws_server.check_for_updates = function (ws_client) {
		marbles_lib.channel_stats(null, function (err, resp) {
			var newBlock = false;
			if (err != null) {
				var eObj = {
					msg: 'error',
					e: err,
				};
				if (ws_client) ws_client.send(JSON.stringify(eObj)); 								//send to a client
				else broadcast(eObj);																//send to all clients
			} else {
				if (resp && resp.height && resp.height.low) {
					if (resp.height.low > known_height || ws_client) {
						if (!ws_client) {
							console.log('');
							logger.info('New block detected!', resp.height.low, resp);
							known_height = resp.height.low;
							newBlock = true;
							logger.debug('[checking] there are new things, sending to all clients');
							broadcast({ msg: 'block', e: null, block_height: resp.height.low });	//send to all clients
						} else {
							logger.debug('[checking] on demand req, sending to a client');
							var obj = {
								msg: 'block',
								e: null,
								block_height: resp.height.low,
								block_delay: g_options.block_delay
							};
							ws_client.send(JSON.stringify(obj)); 									//send to a client
						}
					}
				}
			}

			if (newBlock || ws_client) {
				read_everything(ws_client, function () {
					sch_next_check();						//check again
				});
			} else {
				sch_next_check();							//check again
			}
		});
	};

	// read complete state of marble world
	function read_everything(ws_client, cb) {
		const channel = helper.getChannelId();
		const first_peer = helper.getFirstPeerName(channel);
		var options = {
			peer_urls: [helper.getPeersUrl(first_peer)],
		};

		marbles_lib.read_everything(options, function (err, resp) {
			if (err != null) {
				console.log('');
				logger.debug('[checking] could not get everything:', err);
				var obj = {
					msg: 'error',
					e: err,
				};
				if (ws_client) ws_client.send(JSON.stringify(obj)); 								//send to a client
				else broadcast(obj);																//send to all clients
				if (cb) cb();
			}
			else {
				var data = resp.parsed;
				if (data && data.owners && data.marbles) {
					console.log('');
					logger.debug('[checking] number of owners:', data.owners.length);
					logger.debug('[checking] number of marbles:', data.marbles.length);
				}

				data.owners = organize_usernames(data.owners);
				data.marbles = organize_marbles(data.marbles);
				var knownAsString = JSON.stringify(known_everything);			//stringify for easy comparison (order should stay the same)
				var latestListAsString = JSON.stringify(data);

				if (knownAsString === latestListAsString) {
					logger.debug('[checking] same everything as last time');
					if (ws_client !== null) {									//if this is answering a clients req, send to 1 client
						logger.debug('[checking] sending to 1 client');
						ws_client.send(JSON.stringify({ msg: 'everything', e: err, everything: data }));
					}
				}
				else {															//detected new things, send it out
					logger.debug('[checking] there are new things, sending to all clients');
					known_everything = data;
					broadcast({ msg: 'everything', e: err, everything: data });	//sent to all clients
				}
				if (cb) cb();
			}
		});
	}

	// organize the marble owner list
	function organize_usernames(data) {
		var ownerList = [];
		var myUsers = [];
		for (var i in data) {						//lets reformat it a bit, only need 1 peer's response
			var temp = {
				id: data[i].id,
				username: data[i].username,
				company: data[i].company
			};
			if (temp.company === process.env.marble_company) {
				myUsers.push(temp);					//these are my companies users
			}
			else {
				ownerList.push(temp);				//everyone else
			}
		}

		ownerList = sort_usernames(ownerList);
		ownerList = myUsers.concat(ownerList);		//my users are first, bring in the others
		return ownerList;
	}

	//
	function organize_marbles(allMarbles) {
		var ret = {};
		for (var i in allMarbles) {
			if (!ret[allMarbles[i].owner.username]) {
				ret[allMarbles[i].owner.username] = {
					owner_id: allMarbles[i].owner.id,
					username: allMarbles[i].owner.username,
					company: allMarbles[i].owner.company,
					marbles: []
				};
			}
			ret[allMarbles[i].owner.username].marbles.push(allMarbles[i]);
		}
		return ret;
	}

	// alpha sort everyone else
	function sort_usernames(temp) {
		temp.sort(function (a, b) {
			var entryA = a.company + a.username;
			var entryB = b.company + b.username;
			if (entryA < entryB) return -1;
			if (entryA > entryB) return 1;
			return 0;
		});
		return temp;
	}

	return ws_server;
};
