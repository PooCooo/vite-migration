/**
 * a minimal js file loader
 */
(function(window){
    var pageLoadTime = 0;
    var modulesTime = {};
    var timeOrigin;
    var OB = {};
    window.OB = OB;
    var callbacks = []; // 记录了依赖模块的顺序
    var errorInfo = {};
    var hasErrorInfo = false;
    var loadingNum = 0;
    try{
        timeOrigin = performance.timeOrigin || performance.timing.navigationStart; 
        pageLoadTime = timeOrigin + performance.getEntries()[0].responseStart;
    }catch(e){}

	function addTime(opts){
		opts = opts || {};
		var modules = opts.module.split(/\s*,\s*/g);
		var type = opts.type;
		var time = +(new Date);
		if(!pageLoadTime){
		return;
		}
		if(!(modules[0] && type)){
		return;
		}

		for(var i=0;i<modules.length;i++){
		var module = modules[i];

		if(!modulesTime[module]){
			modulesTime[module] = {};
		}
		if(!modulesTime[module][type]){
			modulesTime[module][type] = Math.round((time - pageLoadTime)*100)/100;
		}
		}
	}

    function addErrorInfo(status, options) {
        hasErrorInfo = true;
        if (!status) {
            return;
        }
        if (!errorInfo[status]) {
            errorInfo[status] = {};
        }
        if (!errorInfo[status][options.name]) {
            errorInfo[status][options.name] = options.url;
        }
    }

    OB.Browser = (function() {
        var na = window.navigator,
            ua = na.userAgent.toLowerCase(),
            browserTester = /(msie|webkit|gecko|presto|opera|safari|firefox|chrome|maxthon|android|ipad|iphone|webos|hpwos)[ \/os]*([\d_.]+)/ig,
            Browser = {
                platform: na.platform
            };
        ua.replace(browserTester, function(a, b, c) {
            var bLower = b.toLowerCase();
            if (!Browser[bLower]) {
                Browser[bLower] = c;
            }
        });
        if (Browser.opera) { //Opera9.8后版本号位置变化
            ua.replace(/opera.*version\/([\d.]+)/, function(a, b) {
                Browser.opera = b;
            });
        }
        if (Browser.msie) {
            Browser.ie = Browser.msie;
            var v = parseInt(Browser.msie, 10);
            Browser['ie' + v] = true;
        }
        return Browser;
    }());
    if (OB.Browser.ie) {
        try {
            document.execCommand("BackgroundImageCache", false, true);
        } catch (e) {}
    };
    var Browser = OB.Browser;
    var DomU = {
        ready: function(handler, doc) {
            doc = doc || document;
            var cbs = doc.__QWDomReadyCbs = doc.__QWDomReadyCbs || [];
            cbs.push(handler);

            function execCbs(){//JK：这里需要保证：每一个回调都执行，并且按顺序，并且每一个回调的异常都被抛出以方便工程师发现错误
                clearTimeout(doc.__QWDomReadyTimer);
                if(cbs.length){
                    var cb = cbs.shift();
                    if(cbs.length) {
                        doc.__QWDomReadyTimer = setTimeout(execCbs,0);
                    }
                    cb();
                }
            }

            setTimeout(function(){ //延迟执行，而不是立即执行，以保证ready方法的键壮
                if (/complete/.test(doc.readyState)) {
                    execCbs();
                } else {
                    if (doc.addEventListener) {
                        // if (!Browser.ie9 && ('interactive' == doc.readyState)) { // IE9下doc.readyState有些异常
                        if ('interactive' == doc.readyState){
                            execCbs();
                        } else {
                            doc.addEventListener('DOMContentLoaded', execCbs, false);
                        }
                    } else {
                        var fireDOMReadyEvent = function() {
                            fireDOMReadyEvent = new Function();
                            execCbs();
                        };
                        (function() {
                            try {
                                doc.body.doScroll('left');
                            } catch (exp) {
                                return setTimeout(arguments.callee, 1);
                            }
                            fireDOMReadyEvent();
                        }());
                        doc.attachEvent('onreadystatechange', function() {
                            ('complete' == doc.readyState) && fireDOMReadyEvent();
                        });
                    }
                }
            },0);
        }
    };
    OB.DomU = DomU;

    /* default modules */
    var modules = {
        'jquery': {
            'url': 'https://s0.qhimg.com/lib/jquery/183.js',
            'checker': function() {return !! window.jQuery}
        },
        'require.2.1.11': {
            'url': 'http://s0.qhimg.com/!5a33324b/require.min.js',
            'checker': function() {return !! (window.require && window.define)}
        },
        'MMPlugin': {
            'url': 'http://s6.qhimg.com/!cd5291ad/MMPlugin.js',
            'checker': function() {return !! window.MMPlugin}
        },
        'mediav': {
            'url': 'http://s2.qhimg.com/static/cd119468809d7ddb.js',
            'checker': function() {return !! window.MediavAds}
        },
        'monitor': {
            'url': 'http://s2.qhimg.com/static/cb61ec2efb86f52e.js',
            'checker': function() {return !! window.monitor}
        },
        'ad-polymer-sdk': {
            'url': 'https://s3.ssl.qhimg.com/static/b7217a938e5c971e.js',
            'checker': function() {return !! window.qhMultiResourceInnV2}
        },
        'solib-biz-sdk': {
            'url': 'https://s4.ssl.qhres2.com/static/e9807f0e77ab1d15.js',
            'checker': function() {return !! (window.soLib && window.soLib.Biz)}
        },
        'solib-monitor-sdk': {
            'url': 'https://s4.ssl.qhres2.com/static/6943dfe83590aa69.js',
            'checker': function() {return !! (window.soLib && window.soLib.Monitor)}
        },
        'solib-polyfill-sdk': {
            'url': 'https://s4.ssl.qhres2.com/static/0b2050c83bdb1945.js',
            'checker': function() {return !! (window.soLib && window.soLib.Biz)}
        },
        'solib-biz-themes': {
            'url': 'https://s1.ssl.qhres2.com/static/cd3fd80b7e205d93.js',
            'checker': function() {return !! (window.soLib && window.soLib.BizThemes)}
        },
        'solib-biz-version': {
            'url': '//' + So.comm.resCDNDomain + '/static/' + So.comm.monitor.bv + '.js',
            'checker': function() {return !! (window.soLib && window.soLib.BizConfig)}
        },
		'vue3.3.9': {
			'url': 'https://s4.ssl.qhres2.com/static/0a1eed4e94711885.js',
			'checker': function() {return !! window.Vue}
		},
		'markdown-it13.0.2': {
			'url': 'https://s1.ssl.qhres2.com/static/f7c956ca0e0b2e4c.js'
		},
		'clipboard2.0.11': {
			'url': 'https://s1.ssl.qhres2.com/static/a093c1322c461ae1.js'
		}
    };
    
    function loadJs_xhr(moduleData, callback) {
        var moduleName = moduleData.moduleName;
        var config = moduleData.config || {};
        var attrs = config.attrs || {};

        var loadCallback = callback.loadCallback;
        var errorCallback = callback.errorCallback;
        var timeoutCallback = callback.timeoutCallback;

        var xhr = window.XDomainRequest && new XDomainRequest() || window.XMLHttpRequest && new XMLHttpRequest() || new ActiveXObject('Microsoft.XMLHTTP');

        xhr.onload = function () {
            if(window.XDomainRequest || (this.readyState = 4 && (this.status >= 200 && this.status < 300))) {            
                // 每次请求回来，按序检查执行js和回调
                config.code = this.responseText;
                loadCallback(moduleName, config);
            } else {
                errorCallback(moduleName, config);
            }
        };

        xhr.ontimeout = function() {
            timeoutCallback(moduleName, config);
        }
        
        xhr.onerror = function(e) {
            errorCallback(moduleName, config);
        }

        xhr.open('GET', config.url, true); // 第三个属性 false时，同步请求；否则异步请求
        xhr.timeout = attrs.timeout || 0; // MDN：在 IE 中，超时属性可能只能在调用 open() 方法之后且在调用 send() 方法之前设置。
        xhr.send();
    
        return xhr;
    }

    function loadJs_jsonp(moduleData, callback, async) {
        var moduleName = moduleData.moduleName;
        var config = moduleData.config || {};

        var loadCallback = callback.loadCallback;
        var errorCallback = callback.errorCallback;
       
        var d = document;
        var head = d.getElementsByTagName('head')[0] || d.documentElement,
            script = d.createElement('script'),
            done = false,
            isErr = 0;

        script.src = config.url;
        script.async = async || false;

        if(config.attrs && typeof config.attrs === 'object') {
            for(var attr in config.attrs) {
                script[attr] = config.attrs[attr];
            }
        }

        script.onerror = script.onload = script.onreadystatechange = function(e) {
            if (!done && (!this.readyState || this.readyState == "loaded" || this.readyState == "complete")) {
                done = true;
                if (e && e.type && e.type == 'error') {
                    isErr = 1;
                }
                
                if (isErr == 0) {
                    config.executed = true;
                    loadCallback(moduleName, config, 'jsonp');
                } else {
                    errorCallback(moduleName, config); 
                }
                
                script.onerror = script.onload = script.onreadystatechange = null;
                head.removeChild(script);
            }
        };

        head.insertBefore(script, head.firstChild);
    };

    function sendErrorInfoLog() {
        if (hasErrorInfo && loadingNum === 0) {
            errorInfo.ajax = So.comm.isajax ? 1 : 0;
            try {
                So.lib.log('loader_info', { value: JSON.stringify(errorInfo) });
                hasErrorInfo = false;
                errorInfo = {};
            } catch (e) {}
        }
    }

    function errorCallback_xhr(moduleName, config) {
        config.loading = false;
        config.method = 'jsonp';
        addErrorInfo('error-xhr', { name: moduleName, url: config.url }); // 此时当前资源一定还需要再次请求，所以不需调sendErrorInfoLog；secondRequestJsonp请求后的callback才会调
        // console.log('xhr load error: ', moduleName);

        secondRequestJsonp();
    }

    function errorCallback_jsonp(moduleName, config) {
        config.loading = false;
        config.method = 'error';
        addErrorInfo('error-jsonp', { name: moduleName, url: config.url });
        loadingNum--;
        sendErrorInfoLog();
        // console.log('jsonp load end error: ', moduleName);
    }

    function secondRequestJsonp() {
        for (var i = 0; i < callbacks.length; i++) {
            var callback = callbacks[i];
            var requires = callback.requires;

            for (var j = 0; j < requires.length; j++) {
                var moduleName = requires[j];
                var config = modules[moduleName];

                if (!config.loaded && config.method === 'xhr') {
                    break;
                }

                if (!config.loaded && config.method === 'jsonp' && !config.loading) {
                    addTime({module: moduleName, type: 'load-start'});
                    config.loading = true;
                    // console.log('jsonp start load: ', moduleName);
                    loadJs_jsonp(
                        { moduleName: moduleName, config: config },
                        { loadCallback: loadCallback, errorCallback: errorCallback_jsonp},
                        requires.length <= 1
                    );
                }             
            }
        }
    }

    // js模块加载完成后的：执行逻辑、callback逻辑
    function execCodeInOrderAndCallback() {
        for (var i = 0; i < callbacks.length; i++) {
            var callback = callbacks[i];
            var requires = callback.requires;

            for (var j = 0; j < requires.length; j++) {
                var moduleName = requires[j];
                var config = modules[moduleName];

                if (!config.loaded) break;

                if (config.loaded  && (config.executed || config.checker && config.checker())) {
                    config.executed = true;
                    requires.splice(j--, 1);
                    continue;
                }
                
                if (config.loaded && !config.executed) {
                    var head = document.getElementsByTagName('head')[0] || document.documentElement;
                    var script = document.createElement('script');
                    script.type = "text/javascript";
                    script.text = config.code.toString();
                    head.insertBefore(script, head.firstChild);
                    
                    config.executed = true;
                    // console.log('execuded end: ', moduleName);
                    requires.splice(j--, 1);
                    head.removeChild(script);
                }
            }

            if (requires.length === 0) { /* 所有依赖模块都有了 */
                callback.fun();
                // console.log('callback done: ', callbacks[i].originRequires);
                callbacks.splice(i--, 1);
            }
        }

        // console.log('callbacks: ', [].concat(callbacks));
    }

    function loadCallback(moduleName, config, method) {
        // console.log(method || 'xhr', 'load end: ', moduleName);
        config.loading = false;
        config.loaded = true;
        
        addTime({module: moduleName, type: 'load-end'});
        loadingNum--;
        sendErrorInfoLog();

        secondRequestJsonp();
        execCodeInOrderAndCallback();
    }

    function timeoutCallback(moduleName, config) {
        addErrorInfo('timeout', { name: moduleName, url: config.url });
        loadingNum--;
        sendErrorInfoLog();
    }

    /* load multiple modules in order */
    function loadsJsInOrder(names) {
        for(var i = 0; i < names.length; i++) {
            var moduleName = names[i];
            var config = modules[moduleName];

            if(!config) {
                // console.log('none config: ', moduleName);
                return;
            };

            if(config.loading) {
                // console.log('loading already: ', moduleName);
                continue;
            }

            if((config.checker && config.checker()) || (config.loaded && config.executed)) {
                // console.log('executed already: ', moduleName);
                config.loaded = true;
                config.executed = true;
                continue
            }
        
            // 加载模块
            config.loading = true;
            config.method = 'xhr';
            if (So.comm && So.comm.loaderConfig && So.comm.loaderConfig[moduleName]) {
                config.attrs = { timeout: So.comm.loaderConfig[moduleName] };
            }
            // console.log('xhr start load: ', moduleName);
            addTime({module: moduleName, type: 'load-start'});

            loadingNum++;
            loadJs_xhr({ moduleName: moduleName, config: config }, { loadCallback: loadCallback, errorCallback: errorCallback_xhr, timeoutCallback: timeoutCallback });
        }
    };

    /* interfaces */
    window._loader = {
        /**
         * add a module
         */
        add: function(name, url, checker, attrs) {
            if (!modules[name]) {
                modules[name] = {
                    url: url,
                    checker: checker,
                    attrs: attrs
                }
            } else {
                if (So.comm.isajax) {
                    modules[name].loaded = false;
                    modules[name].executed = false;
                    modules[name].method = '';
                }
            }
        },

        /**
         * use modules
         */
        use: function(names, callback) {
            addTime({module:names, type:'use'});
            var callback_wrap = (function(names){
                return function(){
                    addTime({module:names, type:'use'});
                    callback()
                }
            })(names);
            OB.DomU.ready(function(){
                names = names.split(/\s*,\s*/g);
                var useCallback = callback_wrap;

                // 先剔除已加载且已执行的依赖，如jquery
                for(var i = 0; i < names.length; i++) {
                    var config = modules[names[i]];
                    
                    if(!config) {
                        return;
                    }
                    
                    if((config.checker && config.checker()) || (config.loaded && config.executed)) {
                        // console.log('executed already: ', names[i]);
                        config.loaded = true;
                        config.executed = true;

                        names.splice(i--, 1);
                        continue;
                    }
                }
                
                if (names.length) {
                    callbacks.push({
                        originRequires: [].concat(names),
                        requires: [].concat(names),
                        fun: useCallback
                    });
                        
                    loadsJsInOrder(names);
                } else {
                    useCallback();
                }
            });
        },

        remove: function(name) {
            modules[name] && delete modules[name];
        }

    };

	window._loader.use('jquery', function(){
		var largTimes = [];
		try{
		(function(){
			if(!window.PerformanceObserver){
			return;
			}
			new window.PerformanceObserver(function(entryList){
			var entrys = entryList.getEntries();
			for(var i=0;i<entrys.length;i++){
				var entry = entrys[i];
				if(entry.renderTime || entry.startTime){
				largTimes.push(toFixed(entry.renderTime) || toFixed(entry.startTime));
				}
			}
			}).observe({type: 'largest-contentful-paint', buffered: true});
		})();
		}catch(e){console.log(e)}

		var toFixed = function(num){
		var newNum = '';
		if(num === '' || num === null || num === undefined){
			return newNum;
		}
		if(!(typeof num === 'string' || typeof num === 'number')){
			return newNum
		}
		try{
			newNum = (num*1).toFixed(2)*1;
			if(isNaN(newNum)){
			newNum = '';
			}
		}catch(e){}
		return newNum; 
		}
		function sendLog(){
            var modInfos = [];//loader加载的模块信息
            var performanceInfo = []; //服务端+前端 性能信息
            var bodySizeInfo = []; //页面大小
            var renderTimes = []; //指定的performance信息
            var navigationInfo = []; //完整的performance
            var abnormalRequestList = []; //慢请求列表
            var _pTime = __performancetime__;
            var requestListSortByDuration; //请求按耗时倒序列表
            var lastRequest; //最后一个请求

            $.each(modulesTime, function(module, info){
                var str = module + "*" + info.use;
                if(info["load-start"] && info["load-end"]){
                str += "*" + info["load-start"] + "*" + info["load-end"];
                }
                modInfos.push(str);
            })
		
            try{
                var navigationTiming = performance.getEntries()[0];
                var firstPaint = performance.getEntriesByName("first-paint")[0] || {startTime:-1};
                var firstContentPaint = performance.getEntriesByName("first-contentful-paint")[0] || {startTime:-1};
                requestListSortByDuration = (function(){
                    var resources = [];
                    $.each(performance.getEntriesByType("resource"), function(key, item){
                        resources.push({
                            name: item.name,
                            duration: item.duration
                        })
                    })
                    resources.sort(function(next, cur){
                        return next.duration < cur.duration ? 1 : next.duration > cur.duration ? -1 : 0
                    })

                    return resources
                })();
                lastRequest = requestListSortByDuration[0];
                
                performanceInfo = [
                _pTime.header_server_render_end - _pTime.header_server_render_start,
                _pTime.header_client_render_start - _pTime.header_server_render_end,
                _pTime.body_server_render_end - _pTime.body_server_render_start,
                _pTime.body_client_render_start - _pTime.body_server_render_start,
                _pTime.server_render_time_count,
                toFixed(navigationTiming.responseEnd - navigationTiming.requestStart),
                _pTime.engine_request_time_count,
                _pTime.header_client_render_end - _pTime.header_client_render_start, 
                _pTime.body_client_render_start - _pTime.header_client_render_end, 
                _pTime.body_client_render_end - _pTime.body_client_render_start 
                ];

                bodySizeInfo = [
                navigationTiming.transferSize || 0,
                navigationTiming.encodedBodySize || 0,
                navigationTiming.decodedBodySize || 0
                ];

                renderTimes = [
                toFixed(navigationTiming.responseStart),
                toFixed(firstPaint.startTime),
                toFixed(firstContentPaint.startTime), 
                toFixed(navigationTiming.domContentLoadedEventStart),
                toFixed(navigationTiming.domContentLoadedEventEnd),
                toFixed(navigationTiming.loadEventStart),
                toFixed(navigationTiming.loadEventEnd)
                ]

                //收集完整的performance
                var navigationTypes = ['startTime', 'unloadEventStart', 'unloadEventEnd', 'redirectStart', 'redirectEnd', 'workerStart', 'fetchStart', 'domainLookupStart', 'domainLookupEnd', 'connectStart', 'secureConnectionStart', 'connectEnd', 'requestStart', 'responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventStart', 'domContentLoadedEventEnd', 'domComplete', 'loadEventStart', 'loadEventEnd'];

                $.each(navigationTypes, function(index, type){
                var num = navigationTiming[type];
                navigationInfo.push(toFixed(num));
                })

                //loadEventEnd慢时，收集最后几条请求
                if(navigationTiming.loadEventEnd > 4000){
                    $.each(requestListSortByDuration.slice(0,5), function(key, item){
                        abnormalRequestList.push(encodeURIComponent(item.name.split("?")[0]) + "*" + toFixed(item.duration))
                    })
                }
            }catch(e){}

            if(!(modInfos.length && performanceInfo.length)){
                return
            }

            var logInfo = [
                modInfos.join('!'),
                performanceInfo.join('!'),
                bodySizeInfo.join('!'),
                renderTimes.join('!'),
                largTimes.join('!'),
                navigationInfo.join('!'),
                abnormalRequestList.join('!')
            ];
            So.lib.log('perfInfo', { value: logInfo.join('$$') });
            //收集最慢请求的performancetiming信息
            try{
              if(lastRequest && lastRequest.name && lastRequest.duration >= 3000){
                  var lastRequestTiming = performance.getEntriesByName(lastRequest.name)[0] || {};
                  if(lastRequestTiming.domainLookupStart || lastRequestTiming.domainLookupEnd || lastRequestTiming.connectStart || lastRequestTiming.connectEnd || lastRequestTiming.secureConnectionStart || lastRequestTiming.requestStart || lastRequestTiming.responseStart){
                      So.lib.log('perfInfoLastRequest', { value: JSON.stringify(lastRequestTiming) });
                  }
              }
            }catch(e){}
      }

		$(window).on('load', function () {
		    setTimeout(sendLog)
		});
	})

    // 测试钩子：仅在 window._LOADER_TEST 为 true 时曝露内部状态供 vitest 断言
    if (window._LOADER_TEST) {
        window._loader.__test__ = {
            get modules() { return modules; }
        };
    }
})(window);

