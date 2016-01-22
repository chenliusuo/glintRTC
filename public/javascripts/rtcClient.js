var PeerManager = (function () {

    var localId,
        config = {
            peerConnectionConfig: {
                iceServers: [
                    {"url": "stun:23.21.150.121"},
                    {"url": "stun:stun.l.google.com:19302"}
                ]
            },
            peerConnectionConstraints: {
                optional: [
                    {"DtlsSrtpKeyAgreement": true}
                ]
            }
        },
        peerDatabase = {},
        localStream,
        remoteVideoContainer = document.getElementById('remoteVideosContainer'),
        socket = io();

    //收到其他用户的消息
    socket.on('message', handleMessage);
    //收到自己的id
    socket.on('id', function (id) {
        localId = id;
    });

    //将远端流作为本地流
    function setPhonePeerforLocalStream(remoteId){
        var camera = {};
        camera.preview = document.getElementById('localVideo');
        var peer = new Peer(config.peerConnectionConfig, config.peerConnectionConstraints);
        peer.pc.onicecandidate = function (event) {
            if (event.candidate) {
                send('candidate', remoteId, {
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }
        };
        //在页面上绑定视频流
        peer.pc.onaddstream = function (event) {
            //alert("在页面上绑定远端shouji流");
            localStream = event.stream;
            attachMediaStream(camera.preview, event.stream);
            camera.stream = event.stream;
            //remoteVideosContainer.appendChild(peer.remoteVideoEl);
        };
        //去掉视频流
        peer.pc.onremovestream = function (event) {
            peer.remoteVideoEl.src = '';
            remoteVideosContainer.removeChild(peer.remoteVideoEl);
        };
        peer.pc.oniceconnectionstatechange = function (event) {
            switch (
                (  event.srcElement // Chrome
                || event.target   ) // Firefox
                    .iceConnectionState) {
                case 'disconnected':
                    remoteVideosContainer.removeChild(peer.remoteVideoEl);
                    break;
            }
        };
        peerDatabase[remoteId] = peer;

        return peer;
    }

    function addPeer(remoteId) {
        var peer = new Peer(config.peerConnectionConfig, config.peerConnectionConstraints);
        peer.pc.onicecandidate = function (event) {
            if (event.candidate) {
                send('candidate', remoteId, {
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }
        };
        //在页面上绑定视频流
        peer.pc.onaddstream = function (event) {
            //alert("在页面上绑定远端流");
            attachMediaStream(peer.remoteVideoEl, event.stream);
            remoteVideosContainer.appendChild(peer.remoteVideoEl);
        };
        //去掉视频流
        peer.pc.onremovestream = function (event) {
            peer.remoteVideoEl.src = '';
            remoteVideosContainer.removeChild(peer.remoteVideoEl);
        };
        peer.pc.oniceconnectionstatechange = function (event) {
            switch (
                (  event.srcElement // Chrome
                || event.target   ) // Firefox
                    .iceConnectionState) {
                case 'disconnected':
                    remoteVideosContainer.removeChild(peer.remoteVideoEl);
                    break;
            }
        };
        peerDatabase[remoteId] = peer;

        return peer;
    }

    function answer(remoteId) {
        var pc = peerDatabase[remoteId].pc;
        pc.createAnswer(
            function (sessionDescription) {
                pc.setLocalDescription(sessionDescription);
                send('answer', remoteId, sessionDescription);
            },
            error
        );
    }
    //联系 另外一个 客户端
    function offer(remoteId) {
        var pc = peerDatabase[remoteId].pc;
        pc.createOffer(
            function (sessionDescription) {
                pc.setLocalDescription(sessionDescription);
                //给其发送sdp
                send('offer', remoteId, sessionDescription);
            },
            error
        );
    }
    //消息处理handle
    function handleMessage(message) {
        var type = message.type,
            from = message.from,
            pc = (peerDatabase[from] || addPeer(from)).pc;

        console.log('received ' + type + ' from' +
            ' ' + from);

        switch (type) {
            case 'init':
                toggleLocalStream(pc);
                offer(from);
                break;
            case 'offer':
                pc.setRemoteDescription(new RTCSessionDescription(message.payload), function () {
                }, error);
                answer(from);
                break;
            case 'answer':
                pc.setRemoteDescription(new RTCSessionDescription(message.payload), function () {
                }, error);
                break;
            case 'candidate':
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate({
                        sdpMLineIndex: message.payload.label,
                        sdpMid: message.payload.id,
                        candidate: message.payload.candidate
                    }), function () {
                    }, error);
                }
                break;
        }
    }

    //向服务器发送消息的函数
    function send(type, to, payload) {
        console.log('sending ' + type + ' to ' + to);

        socket.emit('message', {
            to: to,
            type: type,
            payload: payload
        });
    }
    //切换本地视频流
    function toggleLocalStream(pc) {
        if (localStream) {
            (!!pc.getLocalStreams().length) ? pc.removeStream(localStream) : pc.addStream(localStream);
        }
    }

    function error(err) {
        console.log(err);
    }

    return {
        getId: function () {
            return localId;
        },


        //设置本地视频流
        setLocalStream: function (stream) {

            // if local cam has been stopped, remove it from all outgoing streams.
            if (!stream) {
                for (id in peerDatabase) {
                    pc = peerDatabase[id].pc;
                    if (!!pc.getLocalStreams().length) {
                        pc.removeStream(localStream);
                        offer(id);
                    }
                }
            }

            localStream = stream;
        },
        //将手机流设置为本地视频流
        setPhoneStreamforLocalStream: function (remoteId) {
            //alert("正在设置手机流为本地流,对方id"+remoteId);
            setPhonePeerforLocalStream(remoteId);
            // if local cam has been stopped, remove it from all outgoing streams.
            //if (!stream) {
            //    for (id in peerDatabase) {
            //        pc = peerDatabase[id].pc;
            //        if (!!pc.getLocalStreams().length) {
            //            pc.removeStream(localStream);
            //            offer(id);
            //        }
            //    }
            //}
            //localStream = stream;
        },
        //切换本地视频流
        toggleLocalStream: function (remoteId) {
            peer = peerDatabase[remoteId] || addPeer(remoteId);
            toggleLocalStream(peer.pc);
        },
        //初始化 和对方的信令
        peerInit: function (remoteId) {
            peer = peerDatabase[remoteId] || addPeer(remoteId);
            send('init', remoteId, null);
        },
        //初始化 和对方的信令
        peerPhoneInit: function (remoteId) {
            peer = peerDatabase[remoteId] || setPhonePeerforLocalStream(remoteId);
            send('init', remoteId, null);
        },
        //和对方互换sdp信息
        peerRenegociate: function (remoteId) {
            offer(remoteId);
        },

        send: function (type, payload) {
            socket.emit(type, payload);
        }
    };

});

var Peer = function (pcConfig, pcConstraints) {
    this.pc = new RTCPeerConnection(pcConfig, pcConstraints);
    this.remoteVideoEl = document.createElement('video');
    this.remoteVideoEl.controls = true;
    this.remoteVideoEl.autoplay = true;
}