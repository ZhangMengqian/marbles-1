/* global $, window, document */
/* global toTitleCase, connect_to_server, refreshHomePanel, closeNoticePanel, openNoticePanel, show_tx_step, marbles*/
/* global pendingTxDrawing:true */
/* exported record_company, autoCloseNoticePanel, start_up, block_ui_delay*/
var ws = {};
var bgcolors = ['whitebg', 'blackbg', 'redbg', 'greenbg', 'bluebg', 'purplebg', 'pinkbg', 'orangebg', 'yellowbg'];
var autoCloseNoticePanel = null;
var known_companies = {};
var start_up = true;
var lsKey = 'marbles';
var fromLS = {};
var block_ui_delay = 15000; 								//default, gets set in ws block msg
var auditingMarble = null;

var tmp_account="";
var tmp_actrade="";
var tmp_acbench="";
var tmp_bench="";

var base_account="";
var base_actrade="";
var base_acbench="";
var base_bench="";

var http = {};
// =================================================================================
// On Load
// =================================================================================
$(document).on('ready', function () {
	fromLS = window.localStorage.getItem(lsKey);
	if (fromLS) fromLS = JSON.parse(fromLS);
	else fromLS = { story_mode: false };					//dsh todo remove this
	console.log('from local storage', fromLS);

	connect_to_server();

	// =================================================================================
	// jQuery UI Events
	// =================================================================================
	$('#createMarbleButton').click(function () {
		console.log('creating marble');
		var obj = {
			type: 'create',
			color: $('.colorSelected').attr('color'),
			size: $('select[name="size"]').val(),
			username: $('select[name="user"]').val(),
			company: $('input[name="company"]').val(),
			owner_id: $('input[name="owner_id"]').val(),
			v: 1
		};
		console.log('creating marble, sending', obj);
		$('#createPanel').fadeOut();
		$('#tint').fadeOut();

		show_tx_step({ state: 'building_proposal' }, function () {
			ws.send(JSON.stringify(obj));

			refreshHomePanel();
			$('.colorValue').html('Color');											//reset
			for (var i in bgcolors) $('.createball').removeClass(bgcolors[i]);		//reset
			$('.createball').css('border', '2px dashed #fff');						//reset
		});

		return false;
	});

	//fix marble owner panel (don't filter/hide it)
	$(document).on('click', '.marblesFix', function () {
		if ($(this).parent().parent().hasClass('marblesFixed')) {
			$(this).parent().parent().removeClass('marblesFixed');
		}
		else {
			$(this).parent().parent().addClass('marblesFixed');
		}
	});

	//marble color picker
	$(document).on('click', '.colorInput', function () {
		$('.colorOptionsWrap').hide();											//hide any others
		$(this).parent().find('.colorOptionsWrap').show();
	});
	$(document).on('click', '.colorOption', function () {
		var color = $(this).attr('color');
		var html = '<span class="fa fa-circle colorSelected ' + color + '" color="' + color + '"></span>';

		$(this).parent().parent().find('.colorValue').html(html);
		$(this).parent().hide();

		for (var i in bgcolors) $('.createball').removeClass(bgcolors[i]);		//remove prev color
		$('.createball').css('border', '0').addClass(color + 'bg');				//set new color
	});

	//username/company search
	$('#searchUsers').keyup(function () {
		var count = 0;
		var input = $(this).val().toLowerCase();
		for (var i in known_companies) {
			known_companies[i].visible = 0;
		}

		//reset - clear search
		if (input === '') {
			$('.marblesWrap').show();
			count = $('#totalUsers').html();
			$('.companyPanel').fadeIn();
			for (i in known_companies) {
				known_companies[i].visible = known_companies[i].count;
				$('.companyPanel[company="' + i + '"]').find('.companyVisible').html(known_companies[i].visible);
				$('.companyPanel[company="' + i + '"]').find('.companyCount').html(known_companies[i].count);
			}
		}
		else {
			var parts = input.split(',');
			console.log('searching on', parts);

			//figure out if the user matches the search
			$('.marblesWrap').each(function () {												//iter on each marble user wrap
				var username = $(this).attr('username');
				var company = $(this).attr('company');
				if (username && company) {
					var full = (username + company).toLowerCase();
					var show = false;

					for (var x in parts) {													//iter on each search term
						if (parts[x].trim() === '') continue;
						if (full.indexOf(parts[x].trim()) >= 0 || $(this).hasClass('marblesFixed')) {
							count++;
							show = true;
							known_companies[company].visible++;								//this user is visible
							break;
						}
					}

					if (show) $(this).show();
					else $(this).hide();
				}
			});

			//show/hide the company panels
			for (i in known_companies) {
				$('.companyPanel[company="' + i + '"]').find('.companyVisible').html(known_companies[i].visible);
				if (known_companies[i].visible === 0) {
					console.log('hiding company', i);
					$('.companyPanel[company="' + i + '"]').fadeOut();
				}
				else {
					$('.companyPanel[company="' + i + '"]').fadeIn();
				}
			}
		}
		//user count
		$('#foundUsers').html(count);
	});

	//login events
	$('#whoAmI').click(function () {													//drop down for login
		if ($('#userSelect').is(':visible')) {
			$('#userSelect').fadeOut();
			$('#carrot').removeClass('fa-angle-up').addClass('fa-angle-down');
		}
		else {
			$('#userSelect').fadeIn();
			$('#carrot').removeClass('fa-angle-down').addClass('fa-angle-up');
		}
	});

	//open create marble panel
	$(document).on('click', '.addMarble', function () {
		$('#tint').fadeIn();
		$('#createPanel').fadeIn();
		var company = $(this).parents('.innerMarbleWrap').parents('.marblesWrap').attr('company');
		var username = $(this).parents('.innerMarbleWrap').parents('.marblesWrap').attr('username');
		var owner_id = $(this).parents('.innerMarbleWrap').parents('.marblesWrap').attr('owner_id');
		$('select[name="user"]').html('<option value="' + username + '">' + toTitleCase(username) + '</option>');
		$('input[name="company"]').val(company);
		$('input[name="owner_id"]').val(owner_id);
	});

	//close create marble panel
	$('#tint').click(function () {
		if ($('#startUpPanel').is(':visible')) return;
		if ($('#txStoryPanel').is(':visible')) return;
		$('#createPanel, #tint, #settingsPanel').fadeOut();
	});

	//notification drawer
	$('#notificationHandle').click(function () {
		if ($('#noticeScrollWrap').is(':visible')) {
			closeNoticePanel();
		}
		else {
			openNoticePanel();
		}
	});

	//hide a notification
	$(document).on('click', '.closeNotification', function () {
		$(this).parents('.notificationWrap').fadeOut();
	});

	//settings panel
	$('#showSettingsPanel').click(function () {
		$('#settingsPanel, #tint').fadeIn();
	});
	$('#closeSettings').click(function () {
		$('#settingsPanel, #tint').fadeOut();
	});

	//story mode selection
	$('#disableStoryMode').click(function () {
		set_story_mode('off');
	});
	$('#enableStoryMode').click(function () {
		set_story_mode('on');
	});

	//close create panel
	$('#closeCreate').click(function () {
		$('#createPanel, #tint').fadeOut();
	});

	//change size of marble
	$('select[name="size"]').click(function () {
		var size = $(this).val();
		if (size === '16') $('.createball').animate({ 'height': 150, 'width': 150 }, { duration: 200 });
		else $('.createball').animate({ 'height': 250, 'width': 250 }, { duration: 200 });
	});

	//right click opens audit on marble
	$(document).on('contextmenu', '.ball', function () {
		auditMarble(this, true);
		return false;
	});

	//left click audits marble
	$(document).on('click', '.ball', function () {
		auditMarble(this, false);
	});

	$('#submit').click(function(){
		console.log('----------click button to create a new account-------------');
		var obj = 	{
						type: 'create_account',
						ac_id: $('input[name="ac_id"]').val().replace(' ', ''),
						ac_short_name: $('input[name="ac_short_name"]').val(),
						ac_status: $('input[name="status"]').val(),
						term_date: $('input[name="term_date"]').val(),
						inception_date: $('input[name="inception_date"]').val(),
						ac_region: $('input[name="ac_region"]').val(),
						ac_sub_region: $('input[name="ac_sub_region"]').val(),
						cod_country_domicile: $('input[name="cod_country_domicile"]').val(),
						liq_method: $('input[name="liq_method"]').val(),
						contracting_entity: $('input[name="contract_entity"]').val(),
						mgn_entity: $('input[name="mgn_entity"]').val(),
						ac_legal_name: $('input[name="ac_legal_name"]').val(),
						manager_name: $('input[name="manager_name"]').val(),
						cod_ccy_base: $('input[name="cod_ccy_base"]').val(),
						long_name: $('input[name="long_name"]').val(),
						mandate_id: $('input[name="mandate_id"]').val(),
						client_id: $('input[name="client_id"]').val(),
						custodian_name: $('input[name="custodian_name"]').val(),
						sub_mandate_id: $('input[name="sub_mandate_id"]').val(),
						transfer_agent_name: $('input[name="transfer_agent_name"]').val(),
						trust_bank: $('input[name="trust_bank"]').val(),
						re_trust_bank: $('input[name="re_trust_bank"]').val(),
						last_updated_by: $('input[name="last_updated_by"]').val(),
						last_approved_by: $('input[name="last_approved_by"]').val(),
						last_update_date: $('input[name="last_update_date"]').val()
					};
		if(obj.ac_id){
			console.log('creating user, sending', obj);
			ws.send(JSON.stringify(obj));
			showHomePanel();
			$('#user1wrap').append("<p>Create [account]:"+obj.ac_id+" [short name]:"+obj.ac_short_name+"</p>");	
			tmp_account='<div id="acnoti_'+obj.ac_id+'"><p><span style="color:#FF0;">A new account has been created:</span><br>'+
			"[account]:"+obj.ac_id+"<br>[short name]:"+obj.ac_short_name+
			"<br>[status]:"+obj.ac_status+"<br>[term date]:"+obj.term_date+
			"<br>[inception date]:"+obj.inception_date+"<br>[region]:"+obj.ac_region+
			"<br>[sub region]:"+obj.ac_sub_region+"<br>[country domicile]:"+obj.cod_country_domicile+
			"<br>[liq method]:"+obj.liq_method+"<br>[contracting entity]:"+obj.contracting_entity+
			"<br>[mgn entity]:"+obj.mgn_entity+"<br>[account legal name]:"+obj.ac_legal_name+
			"<br>[manager name]:"+obj.manager_name+"<br>[cod_ccy_base]:"+obj.cod_ccy_base+
			"<br>[long name]:"+obj.long_name+"<br>[mandate id]:"+obj.mandate_id+
			"<br>[client id]:"+obj.client_id+"<br>[custodian name]:"+obj.custodian_name+
			"<br>[sub_mandate_id]:"+obj.sub_mandate_id+"<br>[transfer_agent_name]:"+obj.transfer_agent_name+
			"<br>[trust_bank]:"+obj.trust_bank+"<br>[re_trust_bank]:"+obj.re_trust_bank+
			"<br>[last_updated_by]:"+obj.last_updated_by+"<br>[last_approved_by]:"+obj.last_approved_by+
			"<br>[last_update_date]:"+obj.last_update_date+'</p><button type="button" id="del_ac'+obj.ac_id+'">delete</button><hr /></div>';
			$('#ac_history').append(tmp_account);
		}
		return false;
	});

	$('#submit2').click(function(){
		var obj = 	{
						type: 'ac_trade_setup',
						ac_id: $('input[name="t_ac_id"]').val().replace(' ', ''),
						lvts: $('input[name="lvts"]').val(),
						calypso: $('input[name="calypso"]').val(),
						aladdin: $('input[name="aladdin"]').val(),
						trade_start_date: $('input[name="t_start_date"]').val(),
						equity: $('input[name="equity"]').val(),
						fixed_income: $('input[name="fixed_income"]').val()
					};
		if(obj.ac_id){
			console.log('creating user, sending', obj);
			ws.send(JSON.stringify(obj));
			showHomePanel();
			$('#user1wrap').append("<p>account trades:"+obj.ac_id+" [lvts]:"+obj.lvts+"</p>");			
			tmp_actrade='<div id="actranoti_'+obj.ac_id+'"><p><span style="color:#FF0;">An account trade has been created:</span><br>'+
			"[account id]:"+obj.ac_id+"<br>[lvts]:"+obj.lvts+
			"<br>[calypso]:"+obj.calypso+"<br>[aladdin]:"+obj.aladdin+
			"<br>[trade start date]:"+obj.trade_start_date+"<br>[equity]:"+obj.equity+
			'<br>[fixed_income]:'+obj.fixed_income+'</p><button type="button" id="del_actra'+obj.ac_id+'">delete</button><hr /></div>';
			
			$('#actrade_history').append(tmp_actrade);
		}
		return false;
	});

	$('#submit3').click(function(){
		var obj = 	{
						type: 'ac_benchmark',
						ac_id: $('input[name="ben_ac_id"]').val().replace(' ', ''),
						benchmark_id: $('input[name="aben_id"]').val(),
						source: $('input[name="aben_source"]').val(),
						name: $('input[name="aben_name"]').val(),
						currency: $('input[name="aben_currency"]').val(),
						primary_flag: $('input[name="aben_pri_flag"]').val(),
						start_date: $('input[name="aben_startdate"]').val(),
						end_date: $('input[name="aben_enddate"]').val(),
						benchmark_reference_id: $('input[name="aben_ref_id"]').val(),
						benchmark_reference_id_source: $('input[name="aben_ref_id_src"]').val()
					};
		if(obj.ac_id){
			console.log('creating user, sending', obj);
			ws.send(JSON.stringify(obj));
			showHomePanel();
			$('#user1wrap').append("<p>account benchmarks:"+obj.ac_id+" [benchmark_id]:"+obj.benchmark_id+"</p>");		
		    tmp_acbench='<div id="acbennoti_'+obj.ac_id+'"><p><span style="color:#FF0;">An account benchmark has been created:</span><br>'+
			"[account id]:"+obj.ac_id+"<br>[benchmark_id]:"+obj.benchmark_id+
			"<br>[source]:"+obj.source+"<br>[name]:"+obj.name+
			"<br>[currency]:"+obj.currency+"<br>[primary_flag]:"+obj.primary_flag+
			"<br>[start_date]:"+obj.start_date+"<br>[end_date]:"+obj.end_date+
			"<br>[benchmark_reference_id]:"+obj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+obj.benchmark_reference_id_source
			+'</p><button type="button" id="del_acben'+obj.ac_id+'">delete</button><hr /></div>';
			
			$('#acbench_history').append(tmp_acbench);
		}
		return false;
	});

	$('#submit4').click(function(){
		var obj = 	{
						type: 'benchmarks',
						benchmark_id: $('input[name="benchmark_id"]').val().replace(' ', ''),
						id_source: $('input[name="ben_id_src"]').val(),
						name: $('input[name="ben_name"]').val(),
						currency: $('input[name="ben_currency"]').val(),
						benchmark_reference_id: $('input[name="ben_ref_id"]').val(),
						benchmark_reference_id_source: $('input[name="ben_ref_id_src"]').val()
					};
		if(obj.benchmark_id){
			console.log('creating user, sending', obj);
			ws.send(JSON.stringify(obj));
			showHomePanel();
			$('#user1wrap').append("<p>benchmarks:"+obj.benchmark_id+" [name]:"+obj.name+"</p>");		
			  tmp_bench='<div id="benchnoti_'+obj.benchmark_id+'"><p><span style="color:#FF0;">An account trade has been created:</span><br>'+
			"[benchmark_id]:"+obj.benchmark_id+"<br>[id_source]:"+obj.id_source+
			"<br>[name]:"+obj.name+"<br>[currency]:"+obj.currency+
			"<br>[benchmark_reference_id]:"+obj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+obj.benchmark_reference_id_source
			+'</p><button type="button" id="del_bench'+obj.benchmark_id+'">delete</button><hr /></div>';		
		    
		    $('#bench_check_noti').append(tmp_bench);
			$('#bench_history').append(tmp_bench);
			$('#bench_mak_noti').empty();
		}
		return false;
	});

	$('#submit5').click(function(){
		var obj = 	{
						type: 'data_view',
						data_type: $('select[name="data type"]').val()
					};
			console.log(obj.data_type);		
		$('#viewer_button3').fadeIn(300);
		$('#viewer_button2').hide();
		if(obj.data_type){
			console.log('data view request, sending', obj);
			ws.send(JSON.stringify(obj));
		}
		return false;
	});

	$('#create_by_file').click(function(){
        console.log('---------------------CREATE BY A FILE NOW---------------------------');
		var file = document.querySelector('input[type="file"]').files[0];
		console.log(file);
        handleFile(file);
    });

    $('#submit6').click(function(){
		$('#data_history').empty();
		$('#viewer_button3').hide();
	});

	$('#submit7').click(function(){
		var data_type = $('select[name="data type"]').val()
		console.log(data_type)
		$('#viewer_button2').fadeIn(300);
		if(data_type == 'account'){
			$('#accountselect').fadeIn(300);
			$('#actradeselect').hide();
			$('#acbenchmarkselect').hide();
			$('#benchmarkselect').hide();
		}
		else if(data_type == 'ac_trade'){
			$('#accountselect').hide();
			$('#actradeselect').fadeIn(300);
			$('#acbenchmarkselect').hide();
			$('#benchmarkselect').hide();
		}
		else if(data_type == 'ac_benchmark'){
			$('#accountselect').hide();
			$('#actradeselect').hide();
			$('#acbenchmarkselect').fadeIn(300);
			$('#benchmarkselect').hide();
		}
		else if(data_type == 'benchmarks'){
			$('#accountselect').hide();
			$('#actradeselect').hide();
			$('#acbenchmarkselect').hide();
			$('#benchmarkselect').fadeIn(300);
		}
	});

	String.prototype.trim=function(){
		return this.replace(/(^\s*)|(\s*$)/g, "");
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
		// setTimeout(function(){
		// 	//$('#user1wrap').html('');											//reset the panel
		// 	ws.send(JSON.stringify({type: 'get', v: 1}));						//need to wait a bit
		// 	ws.send(JSON.stringify({type: 'chainstats', v: 1}));
		// }, 1000);
	}				
	$('#homeLink').click(function(){
		$('#homePanel').fadeIn(300);
		$('#createPanel').hide();
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').hide();
		$('#panel_viewer').hide();
	});

	$('#createLink').click(function(){
	$('#homePanel').hide();
		$('#homePanel').hide();
		$('#createPanel').fadeIn(300);
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').hide();
		$('#panel_viewer').hide();
	});

	$('#cr_acTradeSetup').click(function(){
		$('#homePanel').hide();
		$('#createPanel').hide();
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').fadeIn(300);
		$('#panel_benchmark').hide();
		$('#panel_viewer').hide();
	});

	$('#cr_acBenchmark').click(function(){
		$('#homePanel').hide();
		$('#createPanel').hide();
		$('#panel_acBenchmark').fadeIn(300);
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').hide();
		$('#panel_viewer').hide();
	});

	$('#cr_benchmark').click(function(){
		$('#homePanel').hide();
		$('#createPanel').hide();
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').fadeIn(300);
		$('#panel_viewer').hide();
	});

	$('#cr_viewer').click(function(){
		$('#homePanel').hide();
		$('#createPanel').hide();
		$('#panel_acBenchmark').hide();
		$('#panel_acTradeSetup').hide();
		$('#panel_benchmark').hide();
		$('#panel_viewer').fadeIn(300);
	});

	$('#nav_ac_maker').click(function(){
		$("#nav_ac_maker").css("color","red");
		$("#nav_ac_checker").css("color","white");
		$('#account_maker').show();
		$('#account_checker').hide();
	});

   $('#nav_ac_checker').click(function(){
		$("#nav_ac_maker").css("color","white");
		$("#nav_ac_checker").css("color","red");
		$('#account_maker').hide();
		$('#account_checker').show();

		$('#ac_data_validity_notice').empty();
        $('#ac_check_notice').empty();

       	var obj = {
       		type: 'untreated',
		   	table_name: 'account'
	   	};
       	console.log('get untreated account, sending');
       	ws.send(JSON.stringify(obj));
    });

   $('#nav_actrade_maker').click(function(){
		$("#nav_actrade_maker").css("color","red");
		$("#nav_actrade_checker").css("color","white");
		$('#actrade_maker').show();
		$('#actrade_checker').hide();

        $('#actrade_mak_noti').empty();

		var obj = {
			type: 'new',
			table_name: 'account'
		};
		console.log('get new accepted account, sending');
		ws.send(JSON.stringify(obj));
	});

   $('#nav_actrade_checker').click(function(){
		$("#nav_actrade_maker").css("color","white");
		$("#nav_actrade_checker").css("color","red");
		$('#actrade_maker').hide();
		$('#actrade_checker').show();

		$('#actra_validity_notice').empty();
		$('#actrade_check_notice').empty();
       	var obj = {
           type: 'untreated',
           table_name: 'ac_trade'
       	};

       	console.log('get untreated ac_treade, sending');
       	ws.send(JSON.stringify(obj));
   });

	$('#nav_acbench_maker').click(function(){
		$("#nav_acbench_maker").css("color","red");
		$("#nav_acbench_checker").css("color","white");
		$('#acbench_maker').show();
		$('#acbench_checker').hide();

		$('#acbench_mak_noti').empty();

		var obj = {
			type: 'new',
			table_name: 'ac_trade'
		};
		console.log('get new accepted account trade information, sending');
        ws.send(JSON.stringify(obj));
	});

    $('#nav_acbench_checker').click(function(){
    	$("#nav_acbench_maker").css("color","white");
		$("#nav_acbench_checker").css("color","red");
		$('#acbench_maker').hide();
		$('#acbench_checker').show();

        $('#acben_validity_notice').empty();
		$('#acbench_check_noti').empty();

		var obj = {
			type: 'untreated',
			table_name: 'ac_benchmark'
		};

        console.log('get untreated ac_benchmark, sending');
        ws.send(JSON.stringify(obj));
    });

    $('#nav_bench_maker').click(function(){
		$("#nav_bench_maker").css("color","red");
		$("#nav_bench_checker").css("color","white");
		$('#benchmark_maker').show();
		$('#benchmark_checker').hide();

		$('#bench_mak_noti').empty();

		var obj = {
			type: 'new',
			table_name: 'ac_benchmark'
		};
        console.log('get new accepted account trade benchmark information, sending');
        ws.send(JSON.stringify(obj));
	});

   $('#nav_bench_checker').click(function(){
	   $("#nav_bench_maker").css("color","white");
	   $("#nav_bench_checker").css("color","red");
	   $('#benchmark_maker').hide();
	   $('#benchmark_checker').show();

       $('#bench_validity_notice').empty();
	   $('#bench_check_noti').empty();
       var obj = {
           type: 'untreated',
           table_name: 'benchmarks'
       };

       console.log('get untreated benchmarks, sending');
       ws.send(JSON.stringify(obj));
    });

 //    $(document).click(function(e){  //click the button
	// 	var clickid=$(e.target).attr('id');
	// 	if (clickid.indexOf("ac_accept_")>=0) {		// accept the account
 //            var obj = {
 //                type: 'ac_accept',
 //                ac_id: clickid.substr(10)
 //            };
 //            console.log('accepting user, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#ac_check_noti_' + clickid.substr(10)).remove();
 //            $('#user1wrap').append("<p>Account Checker Accepted!</p>");
 //        }

 //        else if (clickid.indexOf("ac_decline_")>=0) {		// decline the account
	// 		var obj = {
	// 			type: 'ac_decline',
	// 			ac_id:clickid.substr(11)
	// 		};
	// 		console.log('declining user, sending', obj);
	// 		ws.send(JSON.stringify(obj));
 //            $('#ac_check_noti_' + clickid.substr(11)).remove();
 //            $('#user1wrap').append("<p>Account Checker Declined!</p>");
	// 	}

	// 	else if (clickid.indexOf("actra_accept_")>=0) {		// accept the account trade
	// 		var obj ={
	// 			type: 'actra_accept',
	// 			ac_id: clickid.substr(13)
	// 		};
	// 		console.log('accepting account trade, sending', obj);
	// 		ws.send(JSON.stringify(obj));
	// 		$('#actranoti_' + clickid.substr(13)).remove();
 //            $('#user1wrap').append("<p>Account trade Checker Accepted!</p>");
	// 	}

	// 	else if (clickid.indexOf("actra_decline_")>=0) {
 //            var obj = {
 //                type: 'actra_decline',
 //                ac_id:clickid.substr(14)
 //            };
 //            console.log('declining account trade, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#actranoti_' + clickid.substr(14)).remove();
 //            $('#user1wrap').append("<p>Account trade Checker Declined!</p>");
	// 	}

	// 	else if (clickid.indexOf("acben_accept_")>=0){
 //            var obj ={
 //                type: 'acben_accept',
 //                ac_id: clickid.substr(13)
 //            };
 //            console.log('accepting account benchmark, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#acbennoti_' + clickid.substr(13)).remove();
 //            $('#user1wrap').append("<p>Account Benchmark Checker Accepted!</p>");
	// 	}

	// 	else if (clickid.indexOf("acben_decline_")>=0){
 //            var obj = {
 //                type: 'acben_decline',
 //                ac_id:clickid.substr(14)
 //            };
 //            console.log('declining account benchmark, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#acbennoti_' + clickid.substr(14)).remove();
 //            $('#user1wrap').append("<p>Account Benchmark Checker Declined!</p>");
	// 	}

	// 	else if (clickid.indexOf("bench_accept_")>=0) {
 //            var obj ={
 //                type: 'bench_accept',
 //                id: clickid.substr(13)
 //            };
 //            console.log('accepting benchmarks, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#benchnoti_' + clickid.substr(13)).remove();
 //            $('#user1wrap').append("<p>Benchmarks Checker Accepted!</p>");
	// 	}

	// 	else if (clickid.indexOf("bench_decline_")>=0) {
 //            var obj = {
 //                type: 'bench_decline',
 //                id:clickid.substr(14)
 //            };
 //            console.log('declining benchmarks, sending', obj);
 //            ws.send(JSON.stringify(obj));
 //            $('#benchnoti_' + clickid.substr(14)).remove();
 //            $('#user1wrap').append("<p>Benchmarks Checker Declined!</p>");
	// 	}

	// 	else if (clickid.indexOf("del_bench")>=0){
	// 		var delid=clickid.substr(9);
	// 		$("#benchnoti_"+delid).remove();
	// 		$('#user1wrap').append("<p>Benchmark "+delid+" deleted!</p>");	
	// 	}

	// 	else if (clickid.indexOf("del_acben")>=0){
	// 		var delid=clickid.substr(9);
 //            var obj = {
 //                type: 'know_new_record',
 //                table_name: 'ac_benchmark',
 //                id: delid
 //            };
 //            ws.send(JSON.stringify(obj));
	// 		$("#acbennoti_"+delid).remove();
	// 		$('#user1wrap').append("<p>Ac_benchmark "+delid+" deleted!</p>");	
	// 	}

	// 	else if (clickid.indexOf("del_actra")>=0){
	// 		var delid=clickid.substr(9);
	// 		var obj = {
	// 			type: 'know_new_record',
	// 			table_name: 'ac_trade',
	// 			id: delid
	// 		};
 //            ws.send(JSON.stringify(obj));
	// 		$("#actranoti_"+delid).remove();
	// 		$('#user1wrap').append("<p>Ac_Trade_setup "+delid+" deleted!</p>");	
	// 	}

	// 	else if (clickid.indexOf("del_ac")>=0){
	// 		var delid=clickid.substr(6);
 //            var obj = {
 //                type: 'know_new_record',
 //                table_name: 'account',
 //                id: delid
 //            };
 //            ws.send(JSON.stringify(obj));
	// 		$("#acnoti_"+delid).remove();
	// 		$('#user1wrap').append("<p>Account "+delid+" deleted!</p>");	
	// 	}
	// });

	function auditMarble(that, open) {
		var marble_id = $(that).attr('id');
		$('.auditingMarble').removeClass('auditingMarble');

		if (!auditingMarble || marbles[marble_id].id != auditingMarble.id) {//different marble than before!
			for (var x in pendingTxDrawing) clearTimeout(pendingTxDrawing[x]);
			$('.txHistoryWrap').html('');										//clear
		}

		auditingMarble = marbles[marble_id];
		console.log('\nuser clicked on marble', marble_id);

		if (open || $('#auditContentWrap').is(':visible')) {
			$(that).addClass('auditingMarble');
			$('#auditContentWrap').fadeIn();
			$('#marbleId').html(marble_id);
			var color = marbles[marble_id].color;
			for (var i in bgcolors) $('.auditMarble').removeClass(bgcolors[i]);	//reset
			$('.auditMarble').addClass(color.toLowerCase() + 'bg');

			$('#rightEverything').addClass('rightEverythingOpened');
			$('#leftEverything').fadeIn();

			var obj2 = {
				type: 'audit',
				marble_id: marble_id
			};
			ws.send(JSON.stringify(obj2));
		}
	}

	$('#auditClose').click(function () {
		$('#auditContentWrap').slideUp(500);
		$('.auditingMarble').removeClass('auditingMarble');												//reset
		for (var x in pendingTxDrawing) clearTimeout(pendingTxDrawing[x]);
		setTimeout(function () {
			$('.txHistoryWrap').html('<div class="auditHint">Click a Marble to Audit Its Transactions</div>');//clear
		}, 750);
		$('#marbleId').html('-');
		auditingMarble = null;

		setTimeout(function () {
			$('#rightEverything').removeClass('rightEverythingOpened');
		}, 500);
		$('#leftEverything').fadeOut();
	});

	$('#auditButton').click(function () {
		$('#auditContentWrap').fadeIn();
		$('#rightEverything').addClass('rightEverythingOpened');
		$('#leftEverything').fadeIn();
	});

	let selectedOwner = null;
	// show dialog to confirm if they want to disable the marble owner
	$(document).on('click', '.disableOwner', function () {
		$('#disableOwnerWrap, #tint').fadeIn();
		selectedOwner = $(this).parents('.marblesWrap');
	});

	// disable the marble owner
	$('#removeOwner').click(function () {
		var obj = {
			type: 'disable_owner',
			owner_id: selectedOwner.attr('owner_id')
		};
		ws.send(JSON.stringify(obj));
		selectedOwner.css('opacity', 0.4);
	});

	$('.closeDisableOwner, #removeOwner').click(function () {
		$('#disableOwnerWrap, #tint').fadeOut();
	});
});

String.prototype.trim=function(){
　　    return this.replace(/(^\s*)|(\s*$)/g, "");
}

function handleFile(files) {
    	if (files.length) {
        var file = files[0];
        var reader = new FileReader();
        if(reader){
        	console.log("data from files",files[0]);
        }
        if (/text\/\w+/.test(file.type)) {
            reader.onload = function() {
			   var i=0;
               // $('<pre>' + this.result + '</pre>').appendTo('body');
			   var lists=this.result.split(/[,:;]/);
			   var pos=0;
			   while (true) {
					if (pos>=lists.length) break;
					lists[pos]=lists[pos].trim();
				    if (lists[pos].indexOf('accounts')>=0) {
						var obj = 	{
						type: 'create_account',
						ac_id: lists[pos+1].replace(' ', ''),
						ac_short_name: lists[pos+2].trim(),
						status: lists[pos+3].trim(),
						term_date: lists[pos+4].trim(),
						inception_date: lists[pos+5].trim(),
						ac_region: lists[pos+6].trim(),
						ac_sub_region: lists[pos+7].trim(),
						cod_country_domicile: lists[pos+8].trim(),
						liq_method: lists[pos+9].trim(),
						contracting_entity: lists[pos+10].trim(),
						mgn_entity: lists[pos+11].trim(),
						ac_legal_name: lists[pos+12].trim(),
						manager_name: lists[pos+13].trim(),
						cod_ccy_base: lists[pos+14].trim(),
						long_name: lists[pos+15].trim(),
						mandate_id: lists[pos+16].trim(),
						client_id: lists[pos+17].trim(),
						custodian_name: lists[pos+18].trim(),
						sub_mandate_id: lists[pos+19].trim(),
						transfer_agent_name: lists[pos+20].trim(),
						trust_bank: lists[pos+21].trim(),
						re_trust_bank: lists[pos+22].trim(),
						last_updated_by: lists[pos+23].trim(),
						last_approved_by: lists[pos+24].trim(),
						last_update_date: lists[pos+25].trim()
					    };
						console.log("read line success");
						pos+=26;
						ws.send(JSON.stringify(obj));
						$('#user1wrap').append("<p>account:"+obj.ac_id+" [short name]:"+obj.ac_short_name+"</p>");	
					    tmp_account='<div id="acnoti_'+obj.ac_id+'"><p><span style="color:#FF0;">A new account has been created:</span><br>'+
						"[account]:"+obj.ac_id+"<br>[short name]:"+obj.ac_short_name+
						"<br>[status]:"+obj.ac_status+"<br>[term date]:"+obj.term_date+
						"<br>[inception date]:"+obj.inception_date+"<br>[region]:"+obj.ac_region+
						"<br>[sub region]:"+obj.ac_sub_region+"<br>[country domicile]:"+obj.cod_country_domicile+
						"<br>[liq method]:"+obj.liq_method+"<br>[contracting entity]:"+obj.contracting_entity+
						"<br>[mgn entity]:"+obj.mgn_entity+"<br>[account legal name]:"+obj.ac_legal_name+
						"<br>[manager name]:"+obj.manager_name+"<br>[cod_ccy_base]:"+obj.cod_ccy_base+
						"<br>[long name]:"+obj.long_name+"<br>[mandate id]:"+obj.mandate_id+
						"<br>[client id]:"+obj.client_id+"<br>[custodian name]:"+obj.custodian_name+
						"<br>[sub_mandate_id]:"+obj.sub_mandate_id+"<br>[transfer_agent_name]:"+obj.transfer_agent_name+
						"<br>[trust_bank]:"+obj.trust_bank+"<br>[re_trust_bank]:"+obj.re_trust_bank+
						"<br>[last_updated_by]:"+obj.last_updated_by+"<br>[last_approved_by]:"+obj.last_approved_by+
						"<br>[last_update_date]:"+obj.last_update_date+'</p><button type="button" id="del_ac'+obj.ac_id+'">delete</button><hr /></div>';
						$('#ac_history').append(tmp_account);
					}
					else if (lists[pos].indexOf('account_trades_setup')>=0) {
						var obj = 	{
						type: 'ac_trade_setup',
						ac_id: lists[pos+1].replace(' ', ''),
						lvts: lists[pos+2].trim(),
						calypso: lists[pos+3].trim(),
						aladdin: lists[pos+4].trim(),
						trade_start_date: lists[pos+5].trim(),
						equity: lists[pos+6].trim(),
						fixed_income: lists[pos+7].trim(),
					    };
						console.log("read line success");
						pos+=8;
						ws.send(JSON.stringify(obj));
						$('#user1wrap').append("<p>account trades:"+obj.ac_id+" [lvts]:"+obj.lvts+"</p>");
						// $('#user1wrap').append("<p>account trades:"+obj.ac_id+" [lvts]:"+obj.lvts+"</p>");
						tmp_actrade='<div id="actranoti_'+obj.ac_id+'"><p><span style="color:#FF0;">An account trade has been created:</span><br>'+
						"[account id]:"+obj.ac_id+"<br>[lvts]:"+obj.lvts+
						"<br>[calypso]:"+obj.calypso+"<br>[aladdin]:"+obj.aladdin+
						"<br>[trade start date]:"+obj.trade_start_date+"<br>[equity]:"+obj.equity+
						'<br>[fixed_income]:'+obj.fixed_income+'</p><button type="button" id="del_actra'+obj.ac_id+'">delete</button><hr /></div>';
						$('#actrade_history').append(tmp_actrade);
					}
					else if (lists[pos].indexOf('account_benchmarks')>=0) {
					    var obj = 	{
						type: 'ac_benchmark',
						ac_id: lists[pos+1].replace(' ', ''),
						benchmark_id: lists[pos+2].trim(),
						source: lists[pos+3].trim(),
						name: lists[pos+4].trim(),
						currency: lists[pos+5].trim(),
						primary_flag: lists[pos+6].trim(),
						start_date: lists[pos+7].trim(),
						end_date: lists[pos+8].trim(),
						benchmark_reference_id: lists[pos+9].trim(),
						benchmark_reference_id_source: lists[pos+10].trim()
						};
						console.log("read line success");
						pos+=11;
						ws.send(JSON.stringify(obj));
						$('#user1wrap').append("<p>account trades:"+obj.ac_id+" [lvts]:"+obj.lvts+"</p>");
						tmp_acbench='<div id="acbennoti_'+obj.ac_id+'"><p><span style="color:#FF0;">An account benchmark has been created:</span><br>'+
						"[account id]:"+obj.ac_id+"<br>[benchmark_id]:"+obj.benchmark_id+
						"<br>[source]:"+obj.source+"<br>[name]:"+obj.name+
						"<br>[currency]:"+obj.currency+"<br>[primary_flag]:"+obj.primary_flag+
						"<br>[start_date]:"+obj.start_date+"<br>[end_date]:"+obj.end_date+
						"<br>[benchmark_reference_id]:"+obj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+obj.benchmark_reference_id_source
						+'</p><button type="button" id="del_acben'+obj.ac_id+'">delete</button><hr /></div>';
						$('#acbench_history').append(tmp_acbench);
					}
					else if (lists[pos].indexOf('benchmarks')>=0) {
						var obj = 	{
						type: 'benchmarks',
						benchmark_id: lists[pos+1].replace(' ', ''),
						id_source: lists[pos+2].trim(),
						name: lists[pos+3].trim(),
						currency: lists[pos+4].trim(),
						benchmark_reference_id: lists[pos+5].trim(),
						benchmark_reference_id_source: lists[pos+6].trim(),
						};
						console.log("read line success");
						pos+=7;
						ws.send(JSON.stringify(obj));
						$('#user1wrap').append("<p>benchmarks:"+obj.benchmark_id+" [name]:"+obj.name+"</p>");				
						tmp_acbench='<div id="acbennoti_'+obj.ac_id+'"><p><span style="color:#FF0;">An account benchmark has been created:</span><br>'+
						"[account id]:"+obj.ac_id+"<br>[benchmark_id]:"+obj.benchmark_id+
						"<br>[source]:"+obj.source+"<br>[name]:"+obj.name+
						"<br>[currency]:"+obj.currency+"<br>[primary_flag]:"+obj.primary_flag+
						"<br>[start_date]:"+obj.start_date+"<br>[end_date]:"+obj.end_date+
						"<br>[benchmark_reference_id]:"+obj.benchmark_reference_id+"<br>[benchmark_reference_id_source]:"+obj.benchmark_reference_id_source
						+'</p><button type="button" id="del_acben'+obj.ac_id+'">delete</button><hr /></div>';				
						$('#acbench_history').append(tmp_acbench);
					}
					else break;
				}
                showHomePanel();
            }
            reader.readAsText(file);
        }
    }
}

//toggle story mode
function set_story_mode(setting) {
	if (setting === 'on') {
		fromLS.story_mode = true;
		$('#enableStoryMode').prop('disabled', true);
		$('#disableStoryMode').prop('disabled', false);
		$('#storyStatus').addClass('storyOn').html('on');
		window.localStorage.setItem(lsKey, JSON.stringify(fromLS));		//save
	}
	else {
		fromLS.story_mode = false;
		$('#disableStoryMode').prop('disabled', true);
		$('#enableStoryMode').prop('disabled', false);
		$('#storyStatus').removeClass('storyOn').html('off');
		window.localStorage.setItem(lsKey, JSON.stringify(fromLS));		//save
	}
}