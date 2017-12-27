/* global new_block, $, document, WebSocket, escapeHtml, ws:true, start_up:true, known_companies:true, autoCloseNoticePanel:true */
/* global show_start_up_step, build_notification, build_user_panels, build_company_panel, populate_users_marbles, show_tx_step*/
/* global getRandomInt, block_ui_delay:true, build_a_tx, auditingMarble*/
/* exported transfer_marble, record_company, connect_to_server, refreshHomePanel, pendingTxDrawing*/

var getEverythingWatchdog = null;
var wsTxt = '[ws]';
var pendingTransaction = null;
var pendingTxDrawing = [];

// =================================================================================
// Socket Stuff
// =================================================================================
function connect_to_server() {
	var connected = false;
	connect();

	function connect() {
		var wsUri = null;
		if (document.location.protocol === 'https:') {
			wsTxt = '[wss]';
			wsUri = 'wss://' + document.location.hostname + ':' + document.location.port;
		} else {
			wsUri = 'ws://' + document.location.hostname + ':' + document.location.port;
		}
		console.log(wsTxt + ' Connecting to websocket', wsUri);

		ws = new WebSocket(wsUri);
		ws.onopen = function (evt) { onOpen(evt); };
		ws.onclose = function (evt) { onClose(evt); };
		ws.onmessage = function (evt) { onMessage(evt); };
		ws.onerror = function (evt) { onError(evt); };
	}

	function onOpen(evt) {
		console.log(wsTxt + ' CONNECTED');
		addshow_notification(build_notification(false, 'Connected to Marbles application'), false);
		connected = true;
	}

	function onClose(evt) {
		console.log(wsTxt + ' DISCONNECTED', evt);
		connected = false;
		addshow_notification(build_notification(true, 'Lost connection to Marbles application'), true);
		setTimeout(function () { connect(); }, 5000);					//try again one more time, server restarts are quick
	}

	function onMessage(msg) {
		try {
			var msgObj = JSON.parse(msg.data);

			//marbles
			if (msgObj.msg === 'everything') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				clearTimeout(getEverythingWatchdog);
				clearTimeout(pendingTransaction);
				$('#appStartingText').hide();
				clear_trash();
				build_user_panels(msgObj.everything.owners);
				for (var i in msgObj.everything.marbles) {
					populate_users_marbles(msgObj.everything.marbles[i]);
				}

				start_up = false;
				$('.marblesWrap').each(function () {
					if ($(this).find('.innerMarbleWrap').find('.ball').length === 0) {
						$(this).find('.noMarblesMsg').show();
					}
				});
			}

			//marbles
			else if (msgObj.msg === 'users_marbles') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				populate_users_marbles(msgObj);
			}

			// block
			else if (msgObj.msg === 'block') {
				console.log(wsTxt + ' rec', msgObj.msg, ': ledger blockheight', msgObj.block_height);
				if (msgObj.block_delay) block_ui_delay = msgObj.block_delay * 2;				// should be longer than block delay
				new_block(msgObj.block_height);													// send to blockchain.js
				
				if ($('#auditContentWrap').is(':visible')) {
					var obj = {
						type: 'audit',
						marble_id: auditingMarble.id
					};
					ws.send(JSON.stringify(obj));
				}
			}

			//marble owners
			else if (msgObj.msg === 'owners') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				clearTimeout(getEverythingWatchdog);
				build_user_panels(msgObj.owners);
				console.log(wsTxt + ' sending get_marbles msg');
			}

			//transaction error
			else if (msgObj.msg === 'tx_error') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				if (msgObj.e) {
					var err_msg = (msgObj.e.parsed) ? msgObj.e.parsed : msgObj.e;
					addshow_notification(build_notification(true, escapeHtml(err_msg)), true);
					$('#txStoryErrorTxt').html(err_msg);
					$('#txStoryErrorWrap').show();
				}
			}

			//all marbles sent
			else if (msgObj.msg === 'all_marbles_sent') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				start_up = false;

				$('.marblesWrap').each(function () {
					console.log('checking', $(this).attr('owner_id'), $(this).find('.innerMarbleWrap').find('.ball').length);
					if ($(this).find('.innerMarbleWrap').find('.ball').length === 0) {
						$(this).find('.noMarblesMsg').show();
					}
				});
			}

			//app startup state
			else if (msgObj.msg === 'app_state') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				setTimeout(function () {
					show_start_up_step(msgObj);
				}, 1000);
			}

			//tx state
			else if (msgObj.msg === 'tx_step') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				show_tx_step(msgObj);
			}

			//tx history
			else if (msgObj.msg === 'history') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				var built = 0;
				var x = 0;
				var count = $('.txDetails').length;

				for(x in pendingTxDrawing) clearTimeout(pendingTxDrawing[x]);

				if (count <= 0) {									//if no tx shown yet, append to back
					$('.txHistoryWrap').html('');					//clear
					for (x=msgObj.data.parsed.length-1; x >= 0; x--) {
						built++;
						slowBuildtx(msgObj.data.parsed[x], x, built);
					}

				} else {											//if we already showing tx, prepend to front
					console.log('skipping tx', count);
					for (x=msgObj.data.parsed.length-1; x >= count; x--) {
						var html = build_a_tx(msgObj.data.parsed[x], x);
						$('.txHistoryWrap').prepend(html);
						$('.txDetails:first').animate({ opacity: 1, left: 0 }, 600, function () {
							//after animate
						});
					}
				}
			}

			//general error
			else if (msgObj.msg === 'error') {
				console.log(wsTxt + ' rec', msgObj.msg, msgObj);
				if (msgObj.e) {
					addshow_notification(build_notification(true, escapeHtml(msgObj.e.parsed)), true);
				}
			}

			else if(msgObj.msg === 'chainstats'){
				console.log('rec', msgObj.msg, ': ledger blockheight', msgObj.chainstats.height, 'block', msgObj.blockstats.height);
				var e = formatDate(msgObj.blockstats.transactions[0].timestamp.seconds * 1000, '%M/%d/%Y &nbsp;%I:%m%P');
				$('#blockdate').html('<span style="color:#fff">TIME</span>&nbsp;&nbsp;' + e + ' UTC');
				var temp =  {
								id: msgObj.blockstats.height, 
								blockstats: msgObj.blockstats
							};
				new_block(temp);								//send to blockchain.js
			}

			else if(msgObj.msg === 'account'){
				console.log("accounts from database");
				var hash = $('input[name="hash1"]').is(':checked');
				if(hash){
					console.log('hhh');
				}

				console.log(msgObj.ac_short_name);
				var click = {
						hash: $('input[name="hash1"]').is(':checked'),
						ac_id: $('input[name="ac_id0"]').is(':checked'),
						ac_short_name: $('input[name="ac_short_name0"]').is(':checked'),
						ac_status: $('input[name="status0"]').is(':checked'),
						term_date: $('input[name="term_date0"]').is(':checked'),
						inception_date: $('input[name="inception_date0"]').is(':checked'),
						ac_region: $('input[name="ac_region0"]').is(':checked'),
						ac_sub_region: $('input[name="ac_sub_region0"]').is(':checked'),
						cod_country_domicile: $('input[name="cod_country_domicile0"]').is(':checked'),
						liq_method: $('input[name="liq_method0"]').is(':checked'),
						contracting_entity: $('input[name="contract_entity0"]').is(':checked'),
						mgn_entity: $('input[name="mgn_entity0"]').is(':checked'),
						ac_legal_name: $('input[name="ac_legal_name0"]').is(':checked'),
						manager_name: $('input[name="manager_name0"]').is(':checked'),
						cod_ccy_base: $('input[name="cod_ccy_base0"]').is(':checked'),
						long_name: $('input[name="long_name0"]').is(':checked'),
						mandate_id: $('input[name="mandate_id0"]').is(':checked'),
						client_id: $('input[name="client_id0"]').is(':checked'),
						custodian_name: $('input[name="custodian_name0"]').is(':checked'),
						sub_mandate_id: $('input[name="sub_mandate_id0"]').is(':checked'),
						transfer_agent_name: $('input[name="transfer_agent_name0"]').is(':checked'),
						trust_bank: $('input[name="trust_bank0"]').is(':checked'),
						re_trust_bank: $('input[name="re_trust_bank0"]').is(':checked'),
						last_updated_by: $('input[name="last_updated_by0"]').is(':checked'),
						last_approved_by: $('input[name="last_approved_by0"]').is(':checked'),
						last_update_date: $('input[name="last_update_date0"]').is(':checked')
					};

				var tmp_data = {
						hash: msgObj.sha_value,
						ac_id: msgObj.ac_id,
						ac_short_name: msgObj.ac_short_name,
						ac_status: msgObj.status,
						term_date: msgObj.term_date,
						inception_date: msgObj.inception_date,
						ac_region: msgObj.ac_region,
						ac_sub_region: msgObj.ac_sub_region,
						cod_country_domicile: msgObj.cod_country_domicile,
						liq_method: msgObj.liq_method,
						contracting_entity: msgObj.contracting_entity,
						mgn_entity: msgObj.mgn_entity,
						ac_legal_name: msgObj.ac_legal_name,
						manager_name: msgObj.manager_name,
						cod_ccy_base: msgObj.cod_ccy_base,
						long_name: msgObj.long_name,
						mandate_id: msgObj.mandate_id,
						client_id: msgObj.client_id,
						custodian_name: msgObj.custodian_name,
						sub_mandate_id: msgObj.sub_mandate_id,
						transfer_agent_name: msgObj.transfer_agent_name,
						trust_bank: msgObj.trust_bank,
						re_trust_bank: msgObj.re_trust_bank,
						last_updated_by: msgObj.last_updated_by,
						last_approved_by: msgObj.last_approved_by,
						last_update_date: msgObj.last_update_date
					};

				var title ={
						hash: "[sha_value]:",
						ac_id: "[account]:",
						ac_short_name: "[short name]:",
						ac_status: "[status]:",
						term_date: "[term date]:",
						inception_date: "[inception date]:",
						ac_region: "[region]:",
						ac_sub_region: "[sub region]",
						cod_country_domicile: "[country_domicile]:",
						liq_method: "[liq method]:",
						contracting_entity: "[contracting entity]:",
						mgn_entity: "[mgn entity]:",
						ac_legal_name: "[account legal name]:",
						manager_name: "[manager name]:",
						cod_ccy_base: "[cod_ccy_base]:",
						long_name: "[long name]:",
						mandate_id: "[mandate id]:",
						client_id: "[client id]:",
						custodian_name: "[custodian name]:",
						sub_mandate_id: "[sub_mandate_id]:",
						transfer_agent_name: "[transfer_agent_name]:",
						trust_bank: "[trust bank]:",
						re_trust_bank: "[re_trust_bank]:",
						last_updated_by: "[last_updated_by]:",
						last_approved_by: "[last_approved_by]:",
						last_update_date: "[last_update_date]:"
				}
				base = '<div><hr>';
				for (var s in click){
					if (click[s]){
						base = base + "<br>" + title[s] + tmp_data[s];
					}
				}
				base = base + '<hr /></div>';
				$('#data_history').append(base);
			}

            else if(msgObj.msg === 'account'){
				console.log("accounts from database");
				var hash = $('input[name="hash1"]').is(':checked');
				if(hash){
					console.log('hhh');
				}
				console.log(msgObj.ac_short_name);
				var click = {
						hash: $('input[name="hash1"]').is(':checked'),
						ac_id: $('input[name="ac_id0"]').is(':checked'),
						ac_short_name: $('input[name="ac_short_name0"]').is(':checked'),
						ac_status: $('input[name="status0"]').is(':checked'),
						term_date: $('input[name="term_date0"]').is(':checked'),
						inception_date: $('input[name="inception_date0"]').is(':checked'),
						ac_region: $('input[name="ac_region0"]').is(':checked'),
						ac_sub_region: $('input[name="ac_sub_region0"]').is(':checked'),
						cod_country_domicile: $('input[name="cod_country_domicile0"]').is(':checked'),
						liq_method: $('input[name="liq_method0"]').is(':checked'),
						contracting_entity: $('input[name="contract_entity0"]').is(':checked'),
						mgn_entity: $('input[name="mgn_entity0"]').is(':checked'),
						ac_legal_name: $('input[name="ac_legal_name0"]').is(':checked'),
						manager_name: $('input[name="manager_name0"]').is(':checked'),
						cod_ccy_base: $('input[name="cod_ccy_base0"]').is(':checked'),
						long_name: $('input[name="long_name0"]').is(':checked'),
						mandate_id: $('input[name="mandate_id0"]').is(':checked'),
						client_id: $('input[name="client_id0"]').is(':checked'),
						custodian_name: $('input[name="custodian_name0"]').is(':checked'),
						sub_mandate_id: $('input[name="sub_mandate_id0"]').is(':checked'),
						transfer_agent_name: $('input[name="transfer_agent_name0"]').is(':checked'),
						trust_bank: $('input[name="trust_bank0"]').is(':checked'),
						re_trust_bank: $('input[name="re_trust_bank0"]').is(':checked'),
						last_updated_by: $('input[name="last_updated_by0"]').is(':checked'),
						last_approved_by: $('input[name="last_approved_by0"]').is(':checked'),
						last_update_date: $('input[name="last_update_date0"]').is(':checked')
					};
				var tmp_data = {
						hash: msgObj.sha_value,
						ac_id: msgObj.ac_id,
						ac_short_name: msgObj.ac_short_name,
						ac_status: msgObj.status,
						term_date: msgObj.term_date,
						inception_date: msgObj.inception_date,
						ac_region: msgObj.ac_region,
						ac_sub_region: msgObj.ac_sub_region,
						cod_country_domicile: msgObj.cod_country_domicile,
						liq_method: msgObj.liq_method,
						contracting_entity: msgObj.contracting_entity,
						mgn_entity: msgObj.mgn_entity,
						ac_legal_name: msgObj.ac_legal_name,
						manager_name: msgObj.manager_name,
						cod_ccy_base: msgObj.cod_ccy_base,
						long_name: msgObj.long_name,
						mandate_id: msgObj.mandate_id,
						client_id: msgObj.client_id,
						custodian_name: msgObj.custodian_name,
						sub_mandate_id: msgObj.sub_mandate_id,
						transfer_agent_name: msgObj.transfer_agent_name,
						trust_bank: msgObj.trust_bank,
						re_trust_bank: msgObj.re_trust_bank,
						last_updated_by: msgObj.last_updated_by,
						last_approved_by: msgObj.last_approved_by,
						last_update_date: msgObj.last_update_date
					};

				var title ={
						hash: "[sha_value]:",
						ac_id: "[account]:",
						ac_short_name: "[short name]:",
						ac_status: "[status]:",
						term_date: "[term date]:",
						inception_date: "[inception date]:",
						ac_region: "[region]:",
						ac_sub_region: "[sub region]",
						cod_country_domicile: "[country_domicile]:",
						liq_method: "[liq method]:",
						contracting_entity: "[contracting entity]:",
						mgn_entity: "[mgn entity]:",
						ac_legal_name: "[account legal name]:",
						manager_name: "[manager name]:",
						cod_ccy_base: "[cod_ccy_base]:",
						long_name: "[long name]:",
						mandate_id: "[mandate id]:",
						client_id: "[client id]:",
						custodian_name: "[custodian name]:",
						sub_mandate_id: "[sub_mandate_id]:",
						transfer_agent_name: "[transfer_agent_name]:",
						trust_bank: "[trust bank]:",
						re_trust_bank: "[re_trust_bank]:",
						last_updated_by: "[last_updated_by]:",
						last_approved_by: "[last_approved_by]:",
						last_update_date: "[last_update_date]:"
				}
				base = '<div><hr>';
				for (var s in click){
					if (click[s]){
						base = base + "<br>" + title[s] + tmp_data[s];
					}
				}
				base = base + '<hr /></div>';
				$('#data_history').append(base);
			}

			else if(msgObj.msg === 'ac_trade'){

				console.log("actrade from database");

				var click = {



						hash: $('input[name="hash2"]').is(':checked'),

						ac_id: $('input[name="t_ac_id0"]').is(':checked'),

						lvts: $('input[name="lvts0"]').is(':checked'),

						calypso: $('input[name="calypso0"]').is(':checked'),

						aladdin: $('input[name="aladdin0"]').is(':checked'),

						trade_start_date: $('input[name="t_start_date0"]').is(':checked'),

						equity: $('input[name="equity0"]').is(':checked'),

						fixed_income: $('input[name="fixed_income0"]').is(':checked')

					};

				var tmp_data = {

						hash: msgObj.sha_value,

						ac_id: msgObj.ac_id,

						lvts: msgObj.lvts,

						calypso: msgObj.calypso,

						aladdin: msgObj.aladdin,

						trade_start_date: msgObj.trade_start_date,

						equity: msgObj.equity,

						fixed_income: msgObj.fixed_income

					};

				var title ={

						hash: "[sha_value]:",

						ac_id: "[account]:",

						lvts: "[lvts]:",

						calypso: "[calypso]:",

						aladdin: "[aladdin]:",

						trade_start_date: "[trade start date]:",

						equity: "[equity]:",

						fixed_income: "[fixed income]:"

				}

				base = '<div><hr>';

				for (var s in click){

					if (click[s]){

						base = base + "<br>" + title[s] + tmp_data[s];

					}

				}

				base = base + '<hr /></div>';

				$('#data_history').append(base);

			}

			else if(msgObj.msg === 'ac_benchmark'){
				console.log("ac_benchmarks from database");
				var click = {
						hash: $('input[name="hash3"]').is(':checked'),
						ac_id: $('input[name="ben_ac_id0"]').is(':checked'), 
						benchmark_id: $('input[name="aben_id0"]').is(':checked'),
						source: $('input[name="aben_source0"]').is(':checked'),
						name: $('input[name="aben_name0"]').is(':checked'),
						currency: $('input[name="aben_currency0"]').is(':checked'),
						primary_flag: $('input[name="aben_pri_flag0"]').is(':checked'),
						start_date: $('input[name="aben_startdate0"]').is(':checked'),
						end_date: $('input[name="aben_enddate0"]').is(':checked'),
						benchmark_reference_id: $('input[name="aben_ref_id0"]').is(':checked'),
						benchmark_reference_id_source: $('input[name="aben_ref_id_src0"]').is(':checked')
					};

				var tmp_data = {
						hash: msgObj.sha_value,
						ac_id: msgObj.ac_id,
						benchmark_id: msgObj.benchmark_id,
						source: msgObj.source,
						name: msgObj.name,
						currency: msgObj.currency,
						primary_flag: msgObj.primary_flag,
						start_date: msgObj.start_date,
						end_date: msgObj.end_date,
						benchmark_reference_id: msgObj.benchmark_reference_id,
						benchmark_reference_id_source: msgObj.benchmark_reference_id_source
					};

				var title ={
						hash: "[hash value]:",
						ac_id: "[account]",
						benchmark_id: "[benchmark id]:",
						source: "[source]:",
						name: "[name]:",
						currency: "[currency]:",
						primary_flag: "[primary flag]:",
						start_date: "[start date]:",
						end_date: "[end date]:",
						benchmark_reference_id: "[benchmark reference id]:",
						benchmark_reference_id_source: "[benchmark reference id source]:"
				}

				base = '<div><hr>';
				for (var s in click){;
					if (click[s]){
						base = base + "<br>" + title[s] + tmp_data[s];
					}
				}
				base = base + '<hr /></div>';
				$('#data_history').append(base);
			}

			else if(msgObj.msg === 'benchmarks'){
				console.log("benchmarks from database");
				var click = {
						hash: $('input[name="hash4"]').is(':checked'),
						benchmark_id: $('input[name="benchmark_id0"]').is(':checked'),
						id_source: $('input[name="ben_id_src0"]').is(':checked'),
						name: $('input[name="ben_name0"]').is(':checked'),
						currency: $('input[name="ben_currency0"]').is(':checked'),
						benchmark_reference_id: $('input[name="ben_ref_id0"]').is(':checked'),
						benchmark_reference_id_source: $('input[name="ben_ref_id_src0"]').is(':checked')
				};

				var tmp_data = {
						hash: msgObj.sha_value,
						benchmark_id: msgObj.benchmark_id,
						id_source: msgObj.id_source,
						name: msgObj.name,
						currency: msgObj.currency,
						benchmark_reference_id: msgObj.benchmark_reference_id,
						benchmark_reference_id_source: msgObj.benchmark_reference_id_source
				};

				var title ={
						hash: "[hash value]:",
						benchmark_id: "[benchmark id]:",
						id_source: "[id_source]:",
						name: "[name]:",
						currency: "[currency]:",
						benchmark_reference_id: "[benchmark reference id]:",
						benchmark_reference_id_source: "[benchmark reference id source]:"
				}

				base = '<div><hr>';
				for (var s in click){
					if (click[s]){
						base = base + "<br>" + title[s] + tmp_data[s];
					}
				}
				base = base + '<hr /></div>';
				$('#data_history').append(base);
			}

			else if(msgObj.msg === 'untreated_account'){
				console.log("untreated account from database");  //ac_check_noti_'+msgObj.ac_id+'
				var un_account = '<div id="ac_check_noti_'+msgObj.ac_id+'"><hr/><span style="color:#FF0;">A new account has been created:</span><br>'+"[sha_value]:"+msgObj.sha_value+
                    "<br>[account]:"+msgObj.ac_id+"<br>[short name]:"+msgObj.ac_short_name+
                    "<br>[status]:"+msgObj.status+"<br>[term date]:"+msgObj.term_date+
                    "<br>[inception date]:"+msgObj.inception_date+"<br>[region]:"+msgObj.ac_region+
                    "<br>[sub region]:"+msgObj.ac_sub_region+"<br>[country domicile]:"+msgObj.cod_country_domicile+
                    "<br>[liq method]:"+msgObj.liq_method+"<br>[contracting entity]:"+msgObj.contracting_entity+
                    "<br>[mgn entity]:"+msgObj.mgn_entity+"<br>[account legal name]:"+msgObj.ac_legal_name+
                    "<br>[manager name]:"+msgObj.manager_name+"<br>[cod_ccy_base]:"+msgObj.cod_ccy_base+
                    "<br>[long name]:"+msgObj.long_name+"<br>[mandate id]:"+msgObj.mandate_id+
                    "<br>[client id]:"+msgObj.client_id+"<br>[custodian name]:"+msgObj.custodian_name+
                    "<br>[sub_mandate_id]:"+msgObj.sub_mandate_id+"<br>[transfer_agent_name]:"+msgObj.transfer_agent_name+
                    "<br>[trust_bank]:"+msgObj.trust_bank+"<br>[re_trust_bank]:"+msgObj.re_trust_bank+
                    "<br>[last_updated_by]:"+msgObj.last_updated_by+"<br>[last_approved_by]:"+msgObj.last_approved_by+
                    "<br>[last_update_date]:"+msgObj.last_update_date+
					'<br><br><button type="button" id="ac_accept_'+msgObj.ac_id+'">accept</button>'+
                    '&nbsp;&nbsp;&nbsp;<button type="button" id="ac_decline_'+msgObj.ac_id+'">decline</button><br><br><br><br><br>'+
					'<hr/></div>';
				$('#ac_check_notice').append(un_account);
			}

			else if(msgObj.msg === 'untreated_ac_trade') {
                console.log("untreated ac_trade from database");  //ac_check_noti_'+msgObj.ac_id+'
				var un_ac_trade = '<div id="actranoti_'+msgObj.ac_id+'"><p><span style="color:#FF0;">An account trade has been created:</span><br>'+
                    "[account id]:"+msgObj.ac_id+"<br>[lvts]:"+msgObj.lvts+
                    "<br>[calypso]:"+msgObj.calypso+"<br>[aladdin]:"+msgObj.aladdin+
                    "<br>[trade start date]:"+msgObj.trade_start_date+"<br>[equity]:"+msgObj.equity+
                    '<br>[fixed_income]:'+msgObj.fixed_income+
					'</p><br><button type="button" id="actra_accept_'+msgObj.ac_id+'">accept</button>'+
                    '&nbsp;&nbsp;&nbsp;<button type="button" id="actra_decline_'+msgObj.ac_id+'">decline</button>'+
                    '<hr/></div>';
				$('#actrade_check_notice').append(un_ac_trade);
            }

            else if (msgObj.msg === 'untreated_ac_benchmark') {
				console.log("untreated account benchmark from db");
				var obj = '<div id="acbennoti_'+msgObj.ac_id+'"><p><span style="color:#FF0;">An account benchmark has been created:</span><br>'+
                    "[account id]:"+msgObj.ac_id+"<br>[benchmark_id]:"+msgObj.benchmark_id+
                    "<br>[source]:"+msgObj.source+"<br>[name]:"+msgObj.name+
                    "<br>[currency]:"+msgObj.currency+"<br>[primary_flag]:"+msgObj.primary_flag+
                    "<br>[start_date]:"+msgObj.start_date+"<br>[end_date]:"+msgObj.end_date+
                    "<br>[benchmark_reference_id]:"+msgObj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+msgObj.benchmark_reference_id_source +
                    '</p><br><button type="button" id="acben_accept_'+msgObj.ac_id+'">accept</button>'+
                    '&nbsp;&nbsp;&nbsp;<button type="button" id="acben_decline_'+msgObj.ac_id+'">decline</button><br/>'+
                    '<hr/></div>';
				$('#acbench_check_noti').append(obj);
			}

			else if (msgObj.msg === 'untreated_benchmarks') {
                console.log("untreated benchmarks from db");
                var obj = '<div id="benchnoti_'+msgObj.benchmark_id+'"><p><span style="color:#FF0;">A benchmarks has been created:</span><br>'+
                    "[benchmark_id]:"+msgObj.benchmark_id+"<br>[id_source]:"+msgObj.id_source+
                    "<br>[name]:"+msgObj.name+"<br>[currency]:"+msgObj.currency+
                    "<br>[benchmark_reference_id]:"+msgObj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+msgObj.benchmark_reference_id_source +
                    '</p><br><button type="button" id="bench_accept_'+msgObj.benchmark_id+'">accept</button>'+
                    '&nbsp;&nbsp;&nbsp;<button type="button" id="bench_decline_'+msgObj.benchmark_id+'">decline</button>'+
                    '<hr/></div>';
				$('#bench_check_noti').append(obj);
			}

			else if(msgObj.msg === 'newAccepted_account'){
				console.log("new accepted account from database");
                var obj='<div id="acnoti_'+msgObj.ac_id+'"><p><span style="color:#FF0;">A new account has been created:</span><br>'+
                    "[account]:"+msgObj.ac_id+"<br>[short name]:"+msgObj.ac_short_name+
                    "<br>[status]:"+msgObj.status+"<br>[term date]:"+msgObj.term_date+
                    "<br>[inception date]:"+msgObj.inception_date+"<br>[region]:"+msgObj.ac_region+
                    "<br>[sub region]:"+msgObj.ac_sub_region+"<br>[country domicile]:"+msgObj.cod_country_domicile+
                    "<br>[liq method]:"+msgObj.liq_method+"<br>[contracting entity]:"+msgObj.contracting_entity+
                    "<br>[mgn entity]:"+msgObj.mgn_entity+"<br>[account legal name]:"+msgObj.ac_legal_name+
                    "<br>[manager name]:"+msgObj.manager_name+"<br>[cod_ccy_base]:"+msgObj.cod_ccy_base+
                    "<br>[long name]:"+msgObj.long_name+"<br>[mandate id]:"+msgObj.mandate_id+
                    "<br>[client id]:"+msgObj.client_id+"<br>[custodian name]:"+msgObj.custodian_name+
                    "<br>[sub_mandate_id]:"+msgObj.sub_mandate_id+"<br>[transfer_agent_name]:"+msgObj.transfer_agent_name+
                    "<br>[trust_bank]:"+msgObj.trust_bank+"<br>[re_trust_bank]:"+msgObj.re_trust_bank+
                    "<br>[last_updated_by]:"+msgObj.last_updated_by+"<br>[last_approved_by]:"+msgObj.last_approved_by+
                    "<br>[last_update_date]:"+msgObj.last_update_date+'</p><button type="button" id="del_ac'+msgObj.ac_id+'">OK, I know</button><hr /></div>';
                // $('#ac_check_notice').append(tmp_account);
				$('#actrade_mak_noti').append(obj);
			}

			else if(msgObj.msg === 'newAccepted_actrade'){
                console.log("new accepted account_trade from database");
                var obj = '<div id="actranoti_'+msgObj.ac_id+'"><p><span style="color:#FF0;">An account trade has been created:</span><br>'+
                "[account id]:"+msgObj.ac_id+"<br>[lvts]:"+msgObj.lvts+
                "<br>[calypso]:"+msgObj.calypso+"<br>[aladdin]:"+msgObj.aladdin+
                "<br>[trade start date]:"+msgObj.trade_start_date+"<br>[equity]:"+msgObj.equity+
                '<br>[fixed_income]:'+msgObj.fixed_income+'</p><button type="button" id="del_actra'+msgObj.ac_id+'">OK, I know</button><hr /></div>';
                $('#acbench_mak_noti').append(obj);
            }

            else if(msgObj.msg === 'newAccepted_acben') {
                console.log("new accepted account benchmark from database");
                var obj = '<div id="acbennoti_'+msgObj.ac_id+'"><p><span style="color:#FF0;">An account benchmark has been created:</span><br>'+
                    "[account id]:"+msgObj.ac_id+"<br>[benchmark_id]:"+msgObj.benchmark_id+
                    "<br>[source]:"+msgObj.source+"<br>[name]:"+msgObj.name+
                    "<br>[currency]:"+msgObj.currency+"<br>[primary_flag]:"+msgObj.primary_flag+
                    "<br>[start_date]:"+msgObj.start_date+"<br>[end_date]:"+msgObj.end_date+
                    "<br>[benchmark_reference_id]:"+msgObj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+msgObj.benchmark_reference_id_source
                    +'</p><button type="button" id="del_acben'+msgObj.ac_id+'">OK, I know</button><hr /></div>';
                $('#bench_mak_noti').append(obj);
			}

            else if(msgObj.msg === 'validity') {
                ws.send(JSON.stringify(msgObj));
            }

            else if(msgObj.msg === 're_validity'){
                console.log("account data validity");
                if (msgObj.table_name == 'account') {
                    var account_notice = '<div><hr/><h4>' + "[IP_ADDRESS]" + msgObj.ip_source + '<br/>' + "[NOTICE!] Data in Table `account` changed!" + '<br/>' + "[HASH VALUE] " + msgObj.sha_value + '</h4><hr/></div>';
                    $('#ac_data_validity_notice').append(account_notice);
                }

                else if (msgObj.table_name == 'ac_trade'){
                    var account_notice = '<div><hr/><h4>' + "[IP_ADDRESS]" + msgObj.ip_source + '<br/>' + "[NOTICE!] Data in Table `ac_trade` changed!" + '<br/>' + "[HASH VALUE] " + msgObj.sha_value + '</h4><hr/></div>';
                    $('#actra_validity_notice').append(account_notice);
				}

				else if (msgObj.table_name == 'ac_benchmark') {
                    var account_notice = '<div><hr/><h4>' + "[IP_ADDRESS]" + msgObj.ip_source + '<br/>' + "[NOTICE!] Data in Table `ac_benchmark` changed!" + '<br/>' + "[HASH VALUE] " + msgObj.sha_value + '</h4><hr/></div>';
                    $('#acben_validity_notice').append(account_notice);
				}

				else if (msgObj.table_name == 'benchmarks'){
                    var account_notice = '<div><hr/><h4>' + "[IP_ADDRESS]" + msgObj.ip_source + '<br/>' + "[NOTICE!] Data in Table `benchmarks` changed!" + '<br/>' + "[HASH VALUE] " + msgObj.sha_value + '</h4><hr/></div>';
                    $('#bench_validity_notice').append(account_notice);
				}

                else if(msgObj.table_name == 'unknown'){
                    var notice = '<div><hr/><h4>' + "[IP_ADDRESS]" + msgObj.ip_source + '<br/>' + "[NOTICE!] Can not find the hash value in Table `" + msgObj.show_location + "`! Data changed!" + '<br/>' + "[HASH VALUE] " + msgObj.sha_value + '</h4><hr/></div>';
                    if(msgObj.show_location == 'account') {
                        $('#ac_data_validity_notice').append(notice);
                    }

                    else if(msgObj.show_location == 'ac_trade'){
                    	$('#actra_validity_notice').append(notice);
					}

					else if(msgObj.show_location == 'ac_benchmark') {
                        $('#acben_validity_notice').append(notice);
					}

                    else if(msgObj.show_location == 'benchmarks') {
                        $('#bench_validity_notice').append(notice);
                    }
				}
            }

            else if(msgObj.msg === 'hash'){
				console.log("------------------------ENTER THE HASH--------------------");
				console.log(msgObj.chain_hash);
                var obj ={
                    type: 'recheck',
                    chain_hash: msgObj.chain_hash ,
					table_name: msgObj.table_name
                };
                ws.send(JSON.stringify(obj));

			}
			
			//unknown
			else console.log(wsTxt + ' rec', msgObj.msg, msgObj);
		}
		catch (e) {
			console.log(wsTxt + ' error handling a ws message', e);
		}
	}

	function onError(evt) {
		console.log(wsTxt + ' ERROR ', evt);
	}
}


// =================================================================================
// Helper Fun
// ================================================================================
//show admin panel page
function refreshHomePanel() {
	clearTimeout(pendingTransaction);
	pendingTransaction = setTimeout(function () {								//need to wait a bit
		get_everything_or_else();
	}, block_ui_delay);
}

function showHomePanel(){
		$('#homePanel').fadeIn(300);
		$('#createPanel').hide();
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').hide();
		$('#panel_viewer').hide();
		var part = window.location.pathname.substring(0,3);

		window.history.pushState({},'', part + '/home');						//put it in url so we can f5
		console.log('getting new users');	
		setTimeout(function(){
			//$('#user1wrap').html('');											//reset the panel
			ws.send(JSON.stringify({type: 'get', v: 1}));						//need to wait a bit
			ws.send(JSON.stringify({type: 'chainstats', v: 1}));			
		}, 1000);		
	}

//transfer_marble selected ball to user
function transfer_marble(marbleId, to_owner_id) {
	show_tx_step({ state: 'building_proposal' }, function () {
		var obj = {
			type: 'transfer_marble',
			id: marbleId,
			owner_id: to_owner_id,
			v: 1
		};
		console.log(wsTxt + ' sending transfer marble msg', obj);
		ws.send(JSON.stringify(obj));
		refreshHomePanel();
	});
}

//record the compan, show notice if its new
function record_company(company) {
	if (known_companies[company]) return;										//if i've seen it before, stop

	// -- Show the new company Notification -- //
	if (start_up === false) {
		console.log('[ui] this is a new company! ' + company);
		addshow_notification(build_notification(false, 'Detected a new company "' + company + '"!'), true);
	}

	build_company_panel(company);
	if (start_up === true) addshow_notification(build_notification(false, 'Detected company "' + company + '".'), false);

	console.log('[ui] recorded company ' + company);
	known_companies[company] = {
		name: company,
		count: 0,
		visible: 0
	};
}

//add notification to the panel, show panel now if you want with 2nd param
function addshow_notification(html, expandPanelNow) {
	$('#emptyNotifications').hide();
	$('#noticeScrollWrap').prepend(html);

	var i = 0;
	$('.notificationWrap').each(function () {
		i++;
		if (i > 10) $(this).remove();
	});

	if (expandPanelNow === true) {
		openNoticePanel();
		clearTimeout(autoCloseNoticePanel);
		autoCloseNoticePanel = setTimeout(function () {		//auto close, xx seconds from now
			closeNoticePanel();
		}, 10000);
	}
}

//open the notice panel
function openNoticePanel() {
	$('#noticeScrollWrap').slideDown();
	$('#notificationHandle').children().removeClass('fa-angle-down').addClass('fa-angle-up');
}

//close the notice panel
function closeNoticePanel() {
	$('#noticeScrollWrap').slideUp();
	$('#notificationHandle').children().removeClass('fa-angle-up').addClass('fa-angle-down');
	clearTimeout(autoCloseNoticePanel);
}

//get everything with timeout to get it all again!
function get_everything_or_else(attempt) {
	console.log(wsTxt + ' sending get everything msg');
	clearTimeout(getEverythingWatchdog);
	ws.send(JSON.stringify({ type: 'read_everything', v: 1 }));

	if (!attempt) attempt = 1;
	else attempt++;

	getEverythingWatchdog = setTimeout(function () {
		if (attempt <= 3) {
			console.log('\n\n! [timeout] did not get owners in time, impatiently calling it again', attempt, '\n\n');
			get_everything_or_else(attempt);
		}
		else {
			console.log('\n\n! [timeout] did not get owners in time, hopeless', attempt, '\n\n');
		}
	}, 5000 + getRandomInt(0, 10000));
}

//emtpy trash marble wrap
function clear_trash() {
	$('#trashbin .ball').fadeOut();
	setTimeout(function () {
		$('#trashbin .ball').remove();
	}, 500);
}

// delay build each transaction
function slowBuildtx(data, txNumber, built){
	pendingTxDrawing.push(setTimeout(function () {
		var html = build_a_tx(data, txNumber);
		$('.txHistoryWrap').append(html);
		$('.txDetails:last').animate({ opacity: 1, left: 0 }, 600, function () {
			//after animate
		});
	}, (built * 150)));
}
