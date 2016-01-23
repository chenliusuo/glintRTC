(function (){
	var app = angular.module('projectRtc', [],
		function($locationProvider){$locationProvider.html5Mode(true);}
    );
	var client = new PeerManager();
	var mediaConfig = {
        audio:true,
        video: {
			mandatory: {},
			optional: []
        }
    };

    app.factory('camera', ['$rootScope', '$window', function($rootScope, $window){
    	var camera = {};
    	camera.preview = $window.document.getElementById('localVideo');

    	camera.start = function(){
			return requestUserMedia(mediaConfig)
			.then(function(stream){			
				attachMediaStream(camera.preview, stream);
				client.setLocalStream(stream);
				camera.stream = stream;
				$rootScope.$broadcast('cameraIsOn',true);
			})
			.catch(Error('Failed to get access to local media.'));
		};
    	camera.stop = function(){
    		return new Promise(function(resolve, reject){			
				try {
					camera.stream.stop();
					camera.preview.src = '';
					resolve();
				} catch(error) {
					reject(error);
				}
    		})
    		.then(function(result){
    			$rootScope.$broadcast('cameraIsOn',false);
    		});	
		};
		camera.phonestart = function(){
			return requestUserMedia(mediaConfig)
				.then(function(stream){
					//attachMediaStream(camera.preview, stream);
					//将手机流设置为本地视频流
					client.setPhoneStreamforLocalStream(null);
					//camera.stream = stream;
					$rootScope.$broadcast('cameraIsOn',true);
				})
				.catch(Error('Failed to get access to local media.'));
		};
		return camera;
    }]);

	//远程视频流控制器
	app.controller('RemoteStreamsController', ['camera', '$http', function(camera, $http){
		var rtc = this;
		rtc.remoteStreams = [];
		function getStreamById(id) {
		    for(var i=0; i<rtc.remoteStreams.length;i++) {
		    	if (rtc.remoteStreams[i].id === id) {return rtc.remoteStreams[i];}
		    }
		}
		//刷新在线用户
		rtc.loadData = function () {
			// get list of streams from the server
			$http.get('/streams.json').success(function(data){
				// filter own stream
				var streams = data.filter(function(stream) {
			      	return stream.id != client.getId();
			    });
			    // get former state
			    for(var i=0; i<streams.length;i++) {
			    	var stream = getStreamById(streams[i].id);
			    	streams[i].isPlaying = (!!stream) ? stream.isPLaying : false;
			    }
			    // save new streams
			    rtc.remoteStreams = streams;
			});
		};

		rtc.view = function(stream){
			client.peerInit(stream.id);
			stream.isPlaying = !stream.isPlaying;
		};
		rtc.call = function(stream){
			/* If json isn't loaded yet, construct a new stream 
			 * This happens when you load <serverUrl>/<socketId> : 
			 * it calls socketId immediatly.
			**/
			if(!stream.id){
				stream = {id: stream, isPlaying: false};
				rtc.remoteStreams.push(stream);
			}
			//如果摄像头开着
			if(camera.isOn){
				client.toggleLocalStream(stream.id);
				if(stream.isPlaying){
					client.peerRenegociate(stream.id);
				} else {
					client.peerInit(stream.id);
				}
				stream.isPlaying = !stream.isPlaying;
			} else {//摄像头关着
				camera.start()
				.then(function(result) {
					//切换本地视频流
					client.toggleLocalStream(stream.id);
					if(stream.isPlaying){
						//如果对方视频流正在播放
						client.peerRenegociate(stream.id);
					} else {
						//如果对方视频流不在播放
						//初始化视频流
						client.peerInit(stream.id);
					}
					stream.isPlaying = !stream.isPlaying;
				})
				.catch(function(err) {
					console.log(err);
				});
			}
		};
		//initial load
		rtc.loadData();
    	//if($location.url() != '/'){
      	//	rtc.call($location.url().slice(1));
    	//};
        //remoteStreams = rtc.remoteStreams;
	}]);

	//本地流 控制器
	app.controller('LocalStreamController',['camera', '$scope', '$window', function(camera, $scope, $window){
		var localStream = this;
		localStream.name = 'Guest';
		localStream.link = '';
		localStream.cameraIsOn = false;

		$scope.$on('cameraIsOn', function(event,data) {
    		$scope.$apply(function() {
		    	localStream.cameraIsOn = data;
		    });
		});

		//点击 start/stop按钮
		localStream.toggleCam = function(){
			if(localStream.cameraIsOn){
				//关掉摄像头
				camera.stop()
				.then(function(result){
					client.send('leave');
	    			client.setLocalStream(null);
				})
				.catch(function(err) {
					console.log(err);
				});
			} else {
				//开启摄像头
				camera.start()
				.then(function(result) {
					localStream.link = $window.location.host + '/' + client.getId();
					client.send('readyToStream', { name: localStream.name });
				})
				.catch(function(err) {
					console.log(err);
				});
			}
		};
	}]);

	//
	app.controller('PhoneStreamController',['camera', '$scope', '$window', function(camera, $scope, $window){
		/*
		 * 点击绑定按钮之后执行此函数
		 * 1 给服务端发送 消息
		 * client.send('bind',userid,content);
		 * 2 将手机视频流作为自己的本地流
		 *
		 * */
		var localStream = this;
		localStream.name = 'Guest';
		localStream.link = '';
		localStream.cameraIsOn = false;

		var phoneStream = this;
		phoneStream.id = '';
		var remoteId;
		//与手机绑定后
		phoneStream.toggleCam = function(){
			//client.setPhoneStreamforLocalStream(phoneStream.id);
			client.peerPhoneInit(phoneStream.id);
			//将手机流作为本地流，并向客户端广播
			camera.phonestart()
				.then(function(result) {
					localStream.link = $window.location.host + '/' + client.getId();
					client.send('readyToStream', { name: document.getElementById("username").value });
					//告诉服务器把在线列表中的手机端去掉
					client.send('deletePhoneStream',{ id: phoneStream.id });
				})
				.catch(function(err) {
					console.log(err);
				});

		}
	}]);

})();