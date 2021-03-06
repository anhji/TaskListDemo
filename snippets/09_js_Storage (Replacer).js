//TaskList application logic

//Put entire application in a global variable
var tasklist = tasklist || {};

//Use self-execution funtion to encapsulate application logic
tasklist = (function($, m, host, io, storage){
	var $eleBtnSave,
		$eleListTask,
		$eleTxtTask,
		_mapEle = $("#userMap")[0],
		_dbName = "taskListDb",
		_dBv = 1,
		_socket = null;
		
	var _private = {
		initLocalDb: function(){
			storage.initLocalDb(_dbName, _dBv);
		},
		
		initSocket: function(){
			  if(io === undefined) {
     			console.log("SOCKETS NOT LOADED");
			  	//Mock-out the _socket
			  	_socket = {};
			  	_socket.emit = function(){ /*Do Nothing*/ };
			  	
			  	return; //Sockets not available; don't configure
			  }
			  
			  _socket = io.connect('http://nodesocketdemo.jit.su:80/');	
			  
			  console.log("SOCKET", _socket);		  
			
			  _socket.on('connect', function () {
					console.log("Connected to socket server");
					
					_socket.on('message', function (msg) {
						$("body").append('<p>Received: ' + msg + '</p>');
					});
					
					_socket.on('newTask', function(msg){
						var task = $.parseJSON(msg);
						console.log("NEW TASK", task);
						api.saveTask(null, {"task": task, "broadcast": false});
					});
					
					_socket.on('rmTask', function(msg){
						var taskId = parseInt(msg);
						console.log("RM TASK", taskId);
						api.deleteTask(null, {"taskId": taskId, "broadcast": false})	;
					});		    
			  });					  			  			 
		},
		
		renderList: function(data) {
			//TODO - Use a templating solution, like Kendo UI Templates
			
			var p = $eleListTask;
			
			if(data.length == 0)
				data = [{"id": 0, "text": "No tasks here. Yay!"}];
			
			var newDom = "";
			$.each(data, function(index, item){
				newDom += "<li data-task-id=\""+ item.id +"\" draggable='true'>"+ item.text +"<br /><span>Assigned to: "+ item.user+"</span></li>";		
			});
			
			p.empty();
			p.append(newDom);
		},
		
		getUserLocation: function(){
			if(m.geolocation){
				navigator.geolocation.getCurrentPosition(function(p){										
					var latlng = new google.maps.LatLng(p.coords.latitude, p.coords.longitude);
					var myOptions = {
					      zoom: 8,
					      center: latlng,
					      mapTypeId: google.maps.MapTypeId.ROADMAP
					    };
					var map = new google.maps.Map(_mapEle,
					        myOptions);
					        
					var marker = new google.maps.Marker({
					     map:map,
					     draggable:true,
					     animation: google.maps.Animation.DROP,
					     position: latlng
					   });
				});
			}
		},
		
		autoSaveInput: function(e){
			//Auto-save input as it's typed to local storage
			var ele = e.target;
			
			if(m.localstorage){
				localStorage.taskAutoSave = ele.value;
			}
		},
		
		loadAutoSaveState: function(){
			var ele = $eleTxtTask;
			
			if(localStorage.taskAutoSave != undefined){
				ele.val(localStorage.taskAutoSave);
			}
		}
	}
	
	var api = {
		saveTask: function(e, opts){
			var txt = $eleTxtTask,
				newTask = null;
				
			//Check the form elements' validity
			//(Also escape on opts === undefined to allow Sockets updates)
			if(opts === undefined && !$("form")[0].checkValidity()){
				return; //Invalid - don't continue
			}

			//Prevent form submit
			if(e !== null) e.preventDefault();
			
			if(opts !== undefined && opts.task !== undefined){
				newTask = opts.task;
			}else{
				newTask = {
					"text": txt.val(),
					"timestamp": new Date(),
					"user": "SampleUser"
				};
			}
			
			storage.saveTask(newTask, function(key){
				//Task saved! Clear input, auto save, updated list
				txt.val("");
				
				localStorage.taskAutoSave = "";
				
				api.loadAllTasks();
				
				//Update new task object with key value
				newTask.id = key;
				
				//Update other clients with WebSockets
				if(opts === undefined || opts.broadcast){
					_socket.emit("newTask", JSON.stringify(newTask));
				}
			}, function(){
				//Error handler
				//Most common error is due to duplicate keys (same machine)
				//(reload list anyway)
				api.loadAllTasks();
			});
		},
		
		deleteTask: function(e, opts){
			var key = null;
			
			if(opts !== undefined){
				key = opts.taskId;
			} else {
				key = $(e.target).data("taskId");
		
				if(key == null || key === 0) return;
			
				var check = confirm("Are you sure you want to delete this task?");
				if(!check) return;
			}
		
			storage.deleteTask(key, function(){
				//Rebind the data display
				api.loadAllTasks();
				
				//Update other clients with WebSockets
				if(opts === undefined || opts.broadcast){
					_socket.emit("rmTask", key);
				}
			},
			function(){
				//Most common error is due to item already being deleted
				//(Go ahead and refresh list)
				api.loadAllTasks();
			});
		},
		
		assignTaskTo: function(taskId, newUser){
			//Get the task item
			
			var task = api.getTaskById(taskId, function(t){
				if(t === null) return;
				
				t.user = newUser;
				
				api.updateTask(t, function(){
					api.loadAllTasks();
				});
			});						
		},
		
		loadAllTasks: function(){			
			storage.getAllTasks(function(result) {
				_private.renderList(result);
			});
		},
		
		getTaskById: function(taskId, successCallback){
			storage.getTaskById(taskId, function(task){
				successCallback(task);
			});
		},
		
		updateTask: function(task, successCallback){
			storage.updateTask(task, function(t){
				successCallback(task);
			},
			function(){
			
			});
		},
		
		loadLocation: function(){
			_private.getUserLocation();
		},
		
		init: function(eleBtnSave, eleListTask, eleTxtTask){
			//Init element variables
			$eleBtnSave = $(eleBtnSave);
			$eleListTask = $(eleListTask);
			$eleTxtTask = $(eleTxtTask);
			
			//Bind events
			$eleBtnSave.on("click", api.saveTask);
			$eleListTask.on("click","li", api.deleteTask);
			$(host).on("TASK_DB_READY",api.loadAllTasks);

			//Bind the keyup event to save typing
			$eleTxtTask.on("keyup", _private.autoSaveInput);

			//Check for auto-saved values
			_private.loadAutoSaveState();
			
			//Init the IndexedDB store
			_private.initLocalDb();	
			
			//Init web sockets
			_private.initSocket();

			if(Modernizr.video.h264 != ""){
				var vid = document.createElement("video");
				vid.src = "content/crazyMan.mp4";
				$(vid).attr("type","video/mp4").attr("autoplay","autoplay").attr("loop","loop").attr("controls","controls").height("200").width("200");
				
				$(vid).append("Video not supported");
				
				$("#vidHolder").empty().append(vid);

				//Mute the video volume
				$("video")[0].volume = 0;
			}																		
		}
	}
	
	return api;
}(jQuery, Modernizr, document, io, storage));