'use strict'

/*
Two algorithm modes right now:
SIMPLE -> Only looks at priority
STRESS -> Only looks at stress regarding total available charge until deadline.



*/
const GRID_HEIGHT = 48;
const GRID_WIDTH = 12;
const HISTORY_LINES = 10;

const PRIORITY = 'priority';
const STRESS = 'stress';
const COMBINED = 'combined';
const claimers = ['A', 'B', 'C'];

const _maxStress = 50;


class Tetris {

  constructor (_start, _element, _height, _width, _minWidth, _maxWidth) {
    this.start = _start || 0;
    this.element = _element || '#tetris';
    this.height = _height || 48;
    this.width = _width || 6;
    this.minWidth = _minWidth || Math.round(this.width / 2);
    this.maxWidth = _maxWidth || Math.round(this.width * 2);
    this.now = this.start;
    this.lines = [];
    this.onUpdateCallback = null;
    this.onUnplugCallback = null;
    this.algorithm = COMBINED;

  
    _.times( this.height, this.createLine, this);

    this.claims = _.times(3, n => ({
      claimer: n,
      priority: 0,
      chargeNeeded: 0,
      deadline: 0,
      chargeReceived: 0,
      claimStart: -1,
      predictedClaimEnd: -1
    }));

    console.log(this.lines);
    this.update();
  }
  getCurrentGrid() {
    let lowIndex = _.findIndex(this.lines, line => line.t === this.now, this);
    lowIndex = ~lowIndex ? lowIndex : 0;
    let highIndex = Math.min( lowIndex + GRID_HEIGHT, this.lines.length - 1);
    return this.lines.slice(lowIndex,highIndex);
  }
  getHistoryGrid( claimer ) {
    //TODO: account for the case where someone quickly plugs in and out
    //return the history for a claimer, to be replayed
   
    
    // end: when claimer plugged out 
    let highIndex = _.findIndex(this.lines, line => line.t === this.now, this);

    let claimStart = this.claims[claimer].claimStart;
    // start: when claimer plugged in
    let lowIndex = _.findLastIndex(this.lines, line => line.t === claimStart );
    lowIndex = ~lowIndex ? lowIndex : 0;
    
    return this.lines.slice(lowIndex,highIndex);
  }
  increaseTime() {
    this.now++;
    this.updateChargeReceived();
    this.createLine();
    this.processClaims();
    return this.now;
  }

  get time() {
    return this.now;
  }
  updateChargeReceived() {
    //Every time the time increases we update the amount of charge received
    let line = _.find(this.lines, ln => ln.t === this.now - 1);
    if(!line) return;
    
    _.each(line.claims, lc => {
      this.claims[lc.claimer].chargeReceived += lc.pixels;
    });

  }

  createLine (_lineTime) {
    
    if ( _lineTime === void(0)) {
      _lineTime = this.lines.length ? _.last(this.lines).t + 1 : 0;
    }

    //add random variations to width
    const prev = (this.lines.length > 0) ? _.last(this.lines).pixels.length : _.random(this.minWidth, this.width);
    const variation = Math.round(_.random(-2,2));
    
    let lineLength = prev + variation;
    if(lineLength <= this.minWidth) lineLength = this.minWidth;
    if(lineLength > this.maxWidth) lineLength = this.maxWidth;
       
    // add line
    const line = {
      t: _lineTime,
      meta: {},
      pixels: Array(lineLength).fill(0)
    };
    this.lines.push(line);

    // check total size
    // (make sure we don't run out of memory)
    if( this.lines.length > GRID_HEIGHT + HISTORY_LINES){
      this.lines.shift();
    }
  }

  //claiming algorihm
  updateClaim(claimer, pluggedIn, priority, chargeNeeded, deadline, info) {
     //TODO check events: plug in / plug out...
      //TODO update the last line because of plug out.
      // And trigger the animation.

    let c = this.claims[claimer];
    if(!c) {
      throw new Error('Not a valid claimer:' + claimer);
    }

    if( !pluggedIn && ~c.claimStart ) {
      _.extend( c, {
        priority:0, chargeNeeded:0, deadline:0, chargeReceived: 0, claimStart: -1
      });
      this.onUnplugCallback( claimer );
    } else if( pluggedIn ) {
      _.extend( c, { 
        priority: priority, 
        chargeNeeded: chargeNeeded, 
        deadline: deadline,
        claimStart: ( ~c.claimStart ? c.claimStart : this.now )
      });
    }
       

    //process the claims
    this.processClaims();

  }
  clearLine(){
    //clear line and save it to the record
    //this.updateTotalReceived() ...?
  }
  processClaims () {

    this.printClaims();


    // TODO: check from which point in history to start?..
    // TODO: get totalReceived from history.
    // Then start going trhough the lines starting from "now"
    // Or whenever a line is shifted update the claim object! better
    // Keep track of state of claimers:
    //   - plugged in/out / 

    //we process the claims per line.
    let _totalReceived = [0,0,0];
    if ( this.now > 0 ) {
      _totalReceived = _.map(this.claims, c => c.chargeReceived);
    }
    
     
    _.each(this.lines, function (_line, _lineNo) {
      if ( _line.t < this.now ) {
        return;
      }
      

      let _pixels = _line.pixels;

      // copy claims which are applicable for this line
      this.copyAndFilterClaims(_line, _totalReceived);
     
      // TODO for every algo calculate a claim-strength instead of directly to pixels
      // then use one function to check for leftovers, based on claimstrength
      // TODO: don't take more than needed: on the last line a claimer will now often claim too much.
      if( this.algorithm === PRIORITY ) {
        // Turn priority into pixels
        this.priorityToPixelsNeeded( _line );
        // Check for remainders after rounding
        this.checkLeftoversSimple( _line );
      } else if ( this.algorithm === STRESS ) {
        // calculate how much charge is available for each claimer until deadline
        this.calculateStress( _line, _totalReceived );
        this.stressToPixelsNeeded( _line );
        this.checkLeftoversStress( _line );
      } else if ( this.algorithm === COMBINED ) {
        this.calculateStress( _line, _totalReceived );
        this.combinedToPixelsNeeded( _line );
        this.checkLeftoversStress( _line );
      }
    
      // Keep track of how much charge is received up until this line
      this.updateTotalReceived( _line, _totalReceived, _lineNo === 0  );

      // Fill the pixels based on the claims
      this.fillPixels( _line );
      
    }, this)

    // console.log(this.claims);
    this.update();

  }
  printClaims() {
    //print the current claims
    _.each(this.claims, function (claim, n) {
      $('.form' + claimers[n] + ' .debug').html(JSON.stringify(claim));
    })  
  }
  copyAndFilterClaims( _line, _totalReceived ) {
     _line.claims = _.map(this.claims, function (claim) {


        // Filter out if not plugged in
        if (!~claim.claimStart) {
          return;
        }

        // Filter out if no more is needed
        if (_totalReceived[claim.claimer] >= claim.chargeNeeded) {
          return;
        }


        let _lineClaim = _.clone(claim);

        if(_lineClaim.deadline < _line.t && _totalReceived[_lineClaim.claimer] <= _lineClaim.chargeNeeded){
          //_lineClaim.deadline++;
          _lineClaim.overdue = true;
        }

        // Filter out if past deadline
        // if (claim.deadline < _line.t) {
        //   return;
        // }

        return _lineClaim;

      });

      _line.claims = _.without(_line.claims, undefined);
  }

  /*
  * Stress is calculated looking at total charge available until deadline.
  * Dividing this based on priority.
  * So now it assumes for every claimer X that the other claimers will also charge until 
  * claimer X's deadline.
  */

  calculateStress(_line, _totalReceived) {
    const _totalPriority = _.reduce(_line.claims, (_tot, _c) => _tot + _c.priority, 0);

    _.each(_line.claims, _claim => {
      let _recv = _totalReceived[_claim.claimer] || 0;
      let totalAvailable = this.calculateAvailableCharge( _line.t, _claim.deadline);
      _claim.available = totalAvailable * ( _claim.priority / _totalPriority ); 
      //_claim.stress = ( _claim.chargeNeeded - _recv ) / _claim.available;
  

      //if stress > 1, means there is more available than you need
      //if stress < 1, means there is way less available than you need.
      //cap it to 20, because reasons.
      _claim.stress =  _.min([_maxStress,Math.ceil(( _claim.chargeNeeded - _recv ) / _claim.available)]);

    });
  }
  
  calculateAvailableCharge(_start, _end) {
    return _.reduce(this.lines, (t, v, i) => ( i >= _start && i <= _end )? t + v.pixels.length: t, 0);
  }

  priorityToPixelsNeeded(_line) {
    // Calculate pixels based on priority
      const _totalPriority = _.reduce(_line.claims, (_tot, _c) => _tot + _c.priority, 0);

      _.each(_line.claims, _claim => {
        _claim.pixels = Math.round(_claim.priority / _totalPriority * _line.pixels.length);
      });
  }
  stressToPixelsNeeded(_line ) {
    //TODO: use the priority in the stress calculation
    //const _totalPriority = _.reduce(_line.claims, (_tot, _c) => _tot + _c.priority, 0);

    const _totalStress =  _.reduce(_line.claims, (_tot, _c) => _tot + _c.stress, 0);
    _.each(_line.claims, _claim => {
      _claim.pixels = Math.round(_claim.stress / _totalStress * _line.pixels.length);
    });
  }

  combinedToPixelsNeeded(_line){
    const _totalPriority = _.reduce(_line.claims, (_tot, _c) => _tot + _c.priority, 0);
    const _totalStress =  _.reduce(_line.claims, (_tot, _c) => _tot + _c.stress, 0);


    _.each(_line.claims, _claim => {
      // _claim.pixels = 
      //   Math.round(
      //     _claim.stress / _totalStress * (_line.pixels.length/3*1) +
      //     _claim.priority / _totalPriority * (_line.pixels.length/3*2)
          
      //   )

      //made simplified version.
      _claim.pixels = Math.round(
        (_claim.stress + _claim.priority) / (_totalStress + _totalPriority) * _line.pixels.length
      );
    });
  }

  checkLeftoversSimple( _line ) {
    
      // Check if there is discrepancy bc of rounding
      let pixelsNeeded = this.getPixelsNeeded(_line.claims);
      let diff = _line.pixels.length - pixelsNeeded;
      let oldDiff = diff;

      // If more pixels needed than available
      // (due to rounding) remove low prio pixels

      while (_line.claims.length > 1 && diff < 0) {
        //subtract from lowest priority;
        let lowestPrio = _.min(_line.claims, function (c) {
          return c.priority;
        }).priority;

        _.each(_line.claims, function (c) {
          if (diff < 0 && c.priority === lowestPrio) {
            c.pixels--;
            diff++;
          }
        });
      }

      // If more pixels available then needed
      // deal out to highest prio
      while (_line.claims.length > 1 && diff > 0) {
        //subtract from lowest priority;
        let highestPrio = _.min(_line.claims, function (c) {
          return c.priority;
        }).priority;
        _.each(_line.claims, function (c) {
          if (diff > 0 && c.priority === highestPrio) {
            c.pixels++;
            diff--;
          }
        });
      }

      let newDiff = _line.pixels.length - this.getPixelsNeeded(_line.claims);

      if (oldDiff != 0) {
        // console.log(_line.t + " - needed:" + pixelsNeeded + " avlbl:" + _line.pixels.length + " diff:" + oldDiff + " newDiff:" + newDiff);
      }
  }

  checkLeftoversStress( _line ) {
    
      // Check if there is discrepancy bc of rounding
      let pixelsNeeded = this.getPixelsNeeded(_line.claims);
      let diff = _line.pixels.length - pixelsNeeded;
      let oldDiff = diff;

      // If more pixels needed than available
      // (due to rounding) remove low prio pixels

      while (_line.claims.length > 1 && diff < 0) {
        //subtract from lowest priority;
        let lowestStress = _.min(_line.claims, function (c) {
          return c.stress;
        }).stress;

        _.each(_line.claims, function (c) {
          if (diff < 0 && c.stress === lowestStress) {
            c.pixels--;
            diff++;
          }
        });
      }

      // If more pixels available then needed
      // deal out to highest prio
      while (_line.claims.length > 1 && diff > 0) {
        //subtract from lowest priority;
        let highestStress = _.min(_line.claims, function (c) {
          return c.stress;
        }).stress;
        _.each(_line.claims, function (c) {
          if (diff > 0 && c.stress === highestStress) {
            c.pixels++;
            diff--;
          }
        });
      }

      let newDiff = _line.pixels.length - this.getPixelsNeeded(_line.claims);

      if (oldDiff != 0) {
        // console.log(_line.t + " - needed:" + pixelsNeeded + " avlbl:" + _line.pixels.length + " diff:" + oldDiff + " newDiff:" + newDiff);
      }
  }

   getPixelsNeeded(claims) {
    return _.reduce(claims, function (total, c) {
      return total + c.pixels;
    }, 0);
  }

   updateTotalReceived( _line, _totalReceived, _isFirst ) {
    _.each(_line.claims, function (_c) {
      if (_isFirst) {
        _totalReceived[_c.claimer] = 0;
      }

      _totalReceived[_c.claimer] += _c.pixels
      _c.chargeReceived = _totalReceived[_c.claimer];
    });
  }
  
  fillPixels( _line ) {
    _line.pixels.fill(-1);
  
    _.reduce(_line.claims, function (_fillIndex, _c) {
      _line.pixels.fill(_c.claimer, _fillIndex, _fillIndex + _c.pixels);
      return _fillIndex + _c.pixels;
    }, 0);
  }

  //visualization
  onUpdate (_callback) {
    //only one accomidates for one callback... shoddy solution... sorry for this.
    this.onUpdateCallback = _callback;
  }

  update () {
    //do things
    if (typeof this.onUpdateCallback === "function") {
      this.onUpdateCallback();
    }

    //render function of tetris might be obsolete if swarm does this trick.
    this.render();
  }

  onUnplug( _cb ) {
    this.onUnplugCallback = _cb;
  }
  render () {
    $(this.element).empty();
    
    let htmlStr = '';

    let lowIndex = _.findIndex(this.lines, line => line.t === this.now, this);
    lowIndex = ~lowIndex ? lowIndex : 0;

    let highIndex = Math.min( lowIndex + GRID_HEIGHT, this.lines.length - 1);

    for (let i = highIndex; i >= lowIndex; i--) { //render lines
      let line = this.lines[i];
      let pixels = line.pixels;
      htmlStr += '<tr><td>' + i + '</td><td>' + line.t + '</td>';
      
      for (let j = 0; j < 3; j++){
        let foundClaim = _.find(line.claims, c => c.claimer === j)
        if ( foundClaim ) {
          htmlStr += '<td>';
          htmlStr += foundClaim.chargeReceived + '|' + foundClaim.available.toFixed(2) + '|' + foundClaim.stress.toFixed(2) + '|' + (foundClaim.overdue?'O':'-');
          htmlStr += '</td>';
        } else {
          htmlStr += '<td> - </td>';
        }
      }

      htmlStr += '<td>'
      for (let j = 0; j < pixels.length; j++) { //render pixels
        let pixel = '.';
        if (pixels[j] > -1) {
          pixel = claimers[pixels[j]];
          
          let overdue = this.isOverdue(line.claims, pixels[j], line.t) ? ' overdue':'';

          if (this.isfullyCharged(line.claims, pixels[j])) {
            pixel = '<span class="pixel pixel'+ pixel + overdue + '" style="color:white">' + pixel + '</span>';
          
          } else {
            pixel = '<span class="pixel pixel' + pixel + overdue + '">&nbsp;</span>';
          
          }
        }
        //$(this.element).append('<span class="pixel">' + pixel + '</span>');
        htmlStr += pixel;
      }
      htmlStr += '</td></tr>';
      //$(this.element).append('<br>'); //clear line
    }
    $(this.element).html( htmlStr );
  }
  isOverdue(claims, claimer, time) {
      return !!_.find(claims, function(c) {
        return c.claimer == claimer && c.overdue;
      });
  }
   hasReachedDeadline (claims, claimer, time) {
    return !!_.find(claims, function (c) {
      return c.claimer == claimer && time == c.deadline;
    });
  }
   isfullyCharged  (claims, claimer) {
    return !!_.find(claims, function (c) {
      return c.claimer == claimer && c.chargeReceived >= c.chargeNeeded;
    });
  }
}