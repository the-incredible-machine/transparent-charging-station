const SerialPort = require('serialport');
const [READERS,ENCODERS,PLUGS] = [0,1,2];
const callbacks = [];

let lightsDev;

const STX = '\2';
const ETX = '\3';

exports.init = function(){
	SerialPort.list( (err, ports) => {
		_.each(ports, port => {
			//console.log(port);
			if( port.manufacturer && ~port.manufacturer.indexOf('Arduino')){
				startListening(port);
			}
		});
	});
}
exports.setReadersCallback = function( cb ){
	callbacks[READERS] = cb;
}
exports.setEncodersCallback = function( cb ){
	callbacks[ENCODERS] = cb;
}
exports.setPlugsCallback = function( cb ) {
	callbacks[PLUGS] = cb;
}

exports.setLights = function( leds ) {
	if(!lightsDev) return console.log('leds arduino not yet known');

	lightsDev.write(leds.join(''),err=>{
		if(err) return console.log('Lights error: ', err);
		console.log('Leds data sent succesfully: ', leds.join(''));
	});
}


function startListening( portInfo ) {
	
	let sp = new SerialPort(portInfo.comName, { baudRate: 115200});

	sp.on('error', err => console.log('Error: ', err.message));
	//let fn = {readers:readersData, encoders:encodersData, plugs: plugsData}[dev.type];
	
	let buffer = '';
	
	sp.on('data', (data) => {
		//if( sp == lightsDev ){
			//console.log(data.toString('utf8'));
		//}


		buffer += data.toString('utf8');

		//console.log(buffer);

		buffer = buffer.replace(/Start read/g, '');
		buffer = buffer.replace(/End read/g, '');


		while( ~buffer.indexOf(STX) && ~buffer.indexOf(ETX)){
	
			let stxi = buffer.indexOf(STX);

			//Remove any chars before STX
			if( stxi > 0 ) {
				buffer = buffer.substr(stxi)
				stxi = 0;
			}

			let etxi = buffer.indexOf(ETX);
			if( !~etxi )
				return;
				
			let msg = buffer.substring(stxi+1,etxi);
			buffer = buffer.substr(etxi+1);
			let split = msg.split(',');
			
			if( split.length !== 3 )
				return;
		
			let devType = +split[0];
			let plug = +split[1];
			let value = +split[2];
			
			if( callbacks[devType] ) {
				callbacks[devType](plug, value);
			}

			if( !lightsDev && devType === PLUGS ) {
				lightsDev = sp;
			}
		}

		//if there is no STX symbol clean the whole buffer
		let stxi = buffer.indexOf(STX);
		if( !~stxi ) {
			buffer = '';
			//sp.flush();
		}
		


	});
}
