////////////////////////////////////////////////////////////////////////
// Bank 1 
// Controls current instrument & track parameters
//
// Bank 2
// Controls mixer tracks 1 - 8
////////////////////////////////////////////////////////////////////////

loadAPI(1);
host.defineController("Samson", "Graphite 49 - Graphite P1", "1.0", "45556f70-cee0-11e3-9c1a-0800200c9a66");
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(["SAMSON Graphite 49 Port1"], ["SAMSON Graphite 49 Controller"]);

var DEBUG = false;

var EDIT_MODE = 
{
	SELECTED_TRACK : 0,
	MIXER : 1
};

var CONTROL =
{
	REW 		: 116,	// <<
	FWD 		: 117,	// >>
	STOP 		: 118,	// [ ]
	PLAY 		: 119,	// [>]
	REC 		: 114,	// [R]
	SLIDER_S1_8 : 7, 	// SLIDERS
	KNOB_E1_8 	: 10,	// ROTARY
	FUNC_F1_8 	: 16,	// SOLO
	FUNC_F9_16 	: 24	// MUTE
};

var isPlay = false;
var callinc = 0;


function init()
{
	initMidi();
	initPrimaryDeviceMacro();
	initControls();
}

function initMidi()
{
	host.getMidiInPort(0).createNoteInput("Graphite");
	host.getMidiInPort(0).setMidiCallback(onMidi);
	host.getMidiInPort(0).setSysexCallback(onSysex);
}

function initPrimaryDeviceMacro()
{
	// Setup Primary Instrument Macro Controls
	cursorDevice = host.createCursorDevice();
	cursorTrack = host.createCursorTrack(8, 0);
	primaryInstrument = cursorTrack.getPrimaryInstrument();
	for ( var i = 0; i < 8; i++)
	{
		var p = primaryInstrument.getMacro(i).getAmount();
		p.setIndication(true);
	}
}

function initControls()
{
	trackBank = host.createTrackBank(8, 1, 99);
	transport = host.createTransport();

	// PLAY
	transport.addIsPlayingObserver(
		function(on)
		{
			isPlay = on;			
			sendNoteOn(0, CONTROL.PLAY, on ? 127 : 0);
			sendNoteOn(0, CONTROL.STOP, on ? 0 : 127);
		});
		
	// REC
	transport.addIsRecordingObserver(
		function(on)
		{
			sendNoteOn(0, CONTROL.RECORD, on ? 127 : 0); 
		});
}

function exit()
{
}


function MidiChannel(status)
{
	var c = status - 175;
	return (c > 0 && c < 17) ? c : 0;
}


function logf(message)
{
	if (DEBUG)
	{	
		for(i = 1; i < arguments.length; i ++)
		{
			message = message.replace("{" + (i-1) + "}", arguments[i]);
		}
		println(message);
	}
}

function logGraphite(bank, midiCC, cIndex, value)
{
	if (DEBUG)
	{
		cIndex += 1;
		logf("GRAPHITE : {0} --- {1} --- {2} = {3}", bank, midiCC, cIndex, value);
	}
}

function onMidi(status, data1, data2)
{
	callinc ++;

	if (!isChannelController(status)) return;
	
	var chan = MidiChannel(status);
	var editMode = (chan < 9) ? EDIT_MODE.SELECTED_TRACK : EDIT_MODE.MIXER;
	var cIndex = (chan - 1) % 8;

	//logf("MIDI : status {0} --- chan {1} --- CC {2} --- value {3}", status, chan, data1, data2);	
	
	if (transportButtons(data1, data2)) return;

	switch (editMode)
	{
		case EDIT_MODE.SELECTED_TRACK:
			controlSelectedTrack(cIndex, data1, data2);
			break;

		case EDIT_MODE.MIXER:
			controlMixer(cIndex, data1, data2);
			break;
	}
}


// TODO : What about bank/edit-mode identification?
// -- could be hexByteAt(4)?
function onSysex(data)
{
	//logf("sysex [{0}]", data);

	// change volume for selected track
   	if (data.matchesHexPattern("f0 7f 7f 04 01 ?? F7"))  
   	{
    	var value = data.hexByteAt(5);
		logGraphite("global", "slider", 8, value);
		cursorTrack.getVolume().set(value, 128);    	
    }
}

function transportButtons(midiCC, value)
{
	var buttonPressed = true;

	switch (midiCC)
	{
		// TRANSPORT
		case CONTROL.PLAY:
			transport.play();
			break;

		case CONTROL.STOP:
			transport.stop();
			break;

		case CONTROL.REC:
			transport.record();
			break;

		case CONTROL.REW:
        	cursorTrack.selectPrevious();
			break;

		case CONTROL.FWD:
        	cursorTrack.selectNext();
			break;

		default:
			buttonPressed = false;
			break;
	}

	return buttonPressed;
}

////////////////////////////////////////////////////////////////////////////////////
// METHOD 	: controlSelectedTrack
// ABSTRACT : converts harwdware controllers for the selected track
// PARAMS
// 	cindex 	: the index (0 - 7) of the controller (slider, knob, fn bank1, fn bank2)
//	cc 		: the midiCC 
// 	value 	: value sent by hardware controller
function controlSelectedTrack(cIndex, midiCC, value)
{
	switch (midiCC)
	{
		// control macro knobs for primary instrument
		case CONTROL.SLIDER_S1_8:
			logGraphite("track", "slider", cIndex, value);
			primaryInstrument.getMacro(cIndex).getAmount().set(value, 128);
			break;

		// control s1 - s8 for current track
		case CONTROL.KNOB_E1_8:
			logGraphite("track", "knob", cIndex, value);

			var track = cursorTrack;
			if (track != null)
			{
				var send = track.getSend(cIndex);
				if (send != null)
				{
					send.set(value,128);
				}
			}
			break;

		default: 
			controlFunc(midiCC, value); 
			break;
	}
}

////////////////////////////////////////////////////////////////////////////////////
// METHOD 	: controlMixer
// ABSTRACT : converts harwdware controllers for the selected track
// PARAMS
// 	cindex 	: the index (0 - 7) of the controller (slider, knob, fn bank1, fn bank2)
//	cc 		: the midiCC 
// 	value 	: value sent by hardware controller
function controlMixer(cIndex, midiCC, value)
{
	switch (midiCC)
	{
		// control volume faders on mixer
		case CONTROL.SLIDER_S1_8:
			logGraphite("mixer", "slider", cIndex, value);
			
			var track = trackBank.getTrack(cIndex);
			
			if (track != null) 
				track.getVolume().set(value, 128);
			
			break;

		// control track panning
		case CONTROL.KNOB_E1_8:
			logGraphite("mixer", "knob", cIndex, value);
			
			var track = trackBank.getTrack(cIndex);			
			if (track != null)
			{
				var pan = track.getPan();
				if (pan != null)
					pan.set(value,128);
			}
			break;
		
		default:
			controlFunc(midiCC, value);
			break;
	}	
}

function controlFunc(midiCC, value)
{
	// SOLO track 1-8 (F1 - F8)
	if (midiCC >= CONTROL.FUNC_F1_8 && midiCC < CONTROL.FUNC_F1_8 + 8)
	{
		var i = midiCC - CONTROL.FUNC_F1_8; 
		logGraphite("mixer", "solo", i, value);
		trackBank.getTrack(i).getSolo().toggle();
	}
	
	// MUTE track 1-8 (F9 - F16)
	else if (midiCC >= CONTROL.FUNC_F9_16 && midiCC < CONTROL.FUNC_F9_16 + 8)
	{
		var i = midiCC - CONTROL.FUNC_F9_16; 
		logGraphite("mixer", "mute", i, value);
		trackBank.getTrack(i).getMute().toggle();
	}
}