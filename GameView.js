"use strict";

window.onload = function() {
  startApp();
};

function startApp() {
  // Initialize canvas layers for gameBoard
  var backgroundCanvas = document.getElementById("background");
  backgroundCanvas.width = backgroundCanvas.offsetWidth;
  backgroundCanvas.height = backgroundCanvas.offsetHeight;

  var gridCanvas = document.getElementById("emoticons");
  gridCanvas.width = gridCanvas.offsetWidth;
  gridCanvas.height = gridCanvas.offsetHeight;

  var canvas = document.getElementById("grid");
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  var gridContext = gridCanvas.getContext("2d");
  var context = canvas.getContext("2d");
  var backgroundContext = backgroundCanvas.getContext("2d");

  const X_MAX = 8;
  const Y_MAX = 7;
  const EMO_WIDTH = (canvas.width / X_MAX);
  const EMO_HEIGHT = (canvas.height / Y_MAX);
  const ANGRY = "ANGRY";
  const DELIGHTED = "DELIGHTED";
  const EMBARRASSED = "EMBARRASSED";
  const SURPRISED = "SURPRISED";
  const UPSET = "UPSET";
  const EMPTY = "EMPTY";
  const ROW_START = 0;
  const COLUMN_TOP = 0;
  const COLUMN_BOTTOM = (Y_MAX - 1);
  const X = 0;
  const Y = 1;
  const DIVISOR = 2;
  const ZERO = 0;

  var gameStates = {
    introducingEmoticons: 0,
    mainLooping: 1,
    handlingSelection: 2,
    swapping: 3,
    revertingSwap: 4,
    findingMatches: 5,
    highlightingMatches: 6,
    pausing: 7,
    removing: 8,
    dropping: 9,
    checkingForAdditionalMatches: 10,
    finished: 11
  };

  var gameState = gameStates.introducingEmoticons;
  var selection01 = [];
  var selection02 = [];
  var sounds = {};
  var mouseX, mouseY;
  var matchingYList = [];
  var matchingXList = [];
  var emoticons = [];

  var gameView;
  var boardImpl;
  var boardPopulator;
  var selections;
  var score = 0;

  Object.defineProperty(Sound.prototype, "volume", {
    get: function() {
      return this.audio.volume;
    },
    set: function(value) {
      this.audio.volume = value;
    }
  });

  function Sound(sound, looping) {
    this.looping = typeof looping !== 'undefined' ? looping : false;
    this.audio = new Audio();
    this.audio.src = sound + ".ogg";
  }

  Sound.prototype.play = function() {
    if (this.audio === null) {
      return;
    }
    this.audio.load();
    this.audio.autoplay = true;
    if (!this.looping) {
      return;
    }
    this.audio.addEventListener("ended", function() {
      this.load();
      this.autoplay = true;
    }, false);
  };

  // gameView
  gameView = function() {

    var loadSound = function(sound, looping) {
      return new Sound("sound/" + sound, looping);
    };

    canvas.addEventListener("mousedown", onMouseDown);

    function startGame() {
      loadSoundAssets();
      sounds.music.play();
      boardPopulator.populateBoard();
      drawGrid();
      checkImagesLoaded();
      gameLoop();
    }

    function loadSoundAssets() {
      sounds.music = loadSound("shroom_ridge", true);
      sounds.music.volume = 0.1;
      sounds.angry = loadSound("angry", false);
      sounds.angry.volume = 0.9;
      sounds.delighted = loadSound("delighted", false);
      sounds.delighted.volume = 0.9;
      sounds.embarrassed = loadSound("embarrassed", false);
      sounds.embarrassed.volume = 0.9;
      sounds.surprised = loadSound("surprised", false);
      sounds.surprised.volume = 0.9;
      sounds.swap_back = loadSound("swap_back", false);
      sounds.swap_back.volume = 0.1;
      sounds.upset = loadSound("upset", false);
      sounds.upset.volume = 0.9;
    }

    function incrementScore(points) {
      score += points * 10;
      document.getElementById("score").innerHTML = score;
    }

    function drawGrid() {
      for (let i = 0; i <= X_MAX; i++) {
        gridContext.moveTo(i * EMO_WIDTH, ZERO);
        gridContext.lineTo(i * EMO_WIDTH, gridCanvas.height);
        gridContext.stroke(); // vertical
      }

      for (let i = 0; i <= Y_MAX; i++) {
        gridContext.moveTo(ZERO, i * EMO_HEIGHT);
        gridContext.lineTo(gridCanvas.width, i * EMO_HEIGHT);
        gridContext.stroke(); // horizontal
      }
    }

    function checkImagesLoaded() {
      if (boardPopulator.imagesStillLoading > 0) {
        window.setTimeout(checkImagesLoaded, 1000 / 60);
      }
    }

    function drawEmoticons() {
      var emoX, emoY;
      clearCanvas();
      context.save();

      for (let y = Y_MAX - 1; y >= 0; y--) {
        for (let x = 0; x < X_MAX; x++) {
          emoX = emoticons[x][y].getViewPositionX();
          emoY = emoticons[x][y].getViewPositionY();
          context.drawImage(emoticons[x][y].getImage(), emoX, emoY, EMO_WIDTH, EMO_HEIGHT);
        }
      }
      context.restore();
    }

    function clearCanvas() {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    function unhighlightMatches() {
      backgroundContext.clearRect(0, 0, canvas.width, canvas.height);
    }

    function gameLoop() {
      window.setTimeout(gameLoop, 20);
      control();
      drawEmoticons();
    }

    function control() {
      switch (gameState) {
        case gameStates.introducingEmoticons:
          updateDrops();
          break;
        case gameStates.swapping:
        case gameStates.revertingSwap:
          updateSwaps();
          break;
        case gameStates.findingMatches:
          boardImpl.findMatches();
          if (boardImpl.matchesFound()) {
            boardImpl.playAudio();
            gameState = gameStates.highlightingMatches;
          } else {
            boardImpl.swapBack();
          }
          selections.resetUserSelections();
          break;
        case gameStates.highlightingMatches:
          highlightMatches(matchingXList);
          highlightMatches(matchingYList);
          gameState = gameStates.pausing;
          window.setTimeout(unpause, 1500);
          break;
        case gameStates.removing:
          unhighlightMatches();
          boardImpl.removeFromBoard(matchingXList);
          boardImpl.removeFromBoard(matchingYList);
          matchingXList.length = 0;
          matchingYList.length = 0;
          boardImpl.dropEmoticons();
          gameState = gameStates.dropping;
          break;
        case gameStates.dropping:
          updateDrops();
          break;
        case gameStates.checkingForAdditionalMatches:
          boardImpl.findMatches();
          if (boardImpl.matchesFound()) {
            boardImpl.playAudio();
            gameState = gameStates.highlightingMatches;
          } else {
            gameState = gameStates.mainLooping;
          }
          break;
        case gameStates.finished:
          break;
      }
    }

    function unpause() {
      gameState = gameStates.removing;
    }

    function highlightMatches(matches) {
      var removeList;
      var emoX, emoY;
      backgroundContext.save();
      backgroundContext.fillStyle = "#C3D7ED";

      for (let i = 0; i < matches.length; i++) {
        removeList = matches[i];
        incrementScore(removeList.length);
        for (let j = 0; j < removeList.length; j++) {
          emoX = removeList[j].getViewPositionX();
          emoY = removeList[j].getViewPositionY();
          backgroundContext.fillRect(emoX, emoY, EMO_WIDTH, EMO_HEIGHT);
        }
      }
      backgroundContext.restore();
    }

    function onMouseDown(event) {
      if (gameState != gameStates.mainLooping) {
        event.stopPropagation();
      } else {
        gameState = gameStates.handlingSelection;
        mouseX = Math.floor(event.offsetX / EMO_WIDTH);
        mouseY = Math.floor(event.offsetY / EMO_HEIGHT);
        storeSelection(mouseX, mouseY);
      }
    }

    function storeSelection(x, y) {
      highlightSelection(x, y);
      if (!(selections.selection01IsMade())) {
        selections.setSelection01(x, y);
        gameState = gameStates.mainLooping;
      } else {
        selections.setSelection02(x, y);
        checkSelections(x, y);
      }
    }

    function checkSelections(x, y) {
      unHighlightSelection();
      if (!(selections.sameSelectionMadeTwice())) {
        if (selections.adjacentSelections()) {
          boardImpl.swapSelectedEmoticons();
        } else {
          highlightSelection(x, y);
          selections.setSelection02ToSelection01();
          gameState = gameStates.mainLooping;
        }
      } else {
        gameState = gameStates.mainLooping;
        selections.resetUserSelections();
      }
    }

    function highlightSelection(x, y) {
      backgroundContext.save();
      backgroundContext.fillStyle = "#C3D7ED";
      backgroundContext.fillRect(mouseX * EMO_WIDTH, mouseY * EMO_HEIGHT, EMO_WIDTH, EMO_HEIGHT);
      backgroundContext.restore();
    }

    function unHighlightSelection() {
      backgroundContext.save();
      backgroundContext.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
      backgroundContext.restore();
    }

    function updateSwaps() {
      var emoticonsSwapping = false;

      if (gameState != gameStates.swapping && gameState != gameStates.revertingSwap) {
        console.log("ERROR in updateSwaps(). gameState != swapping nor revertingSwap");
      }
      for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
        for (let x = ROW_START; x < X_MAX; x++) {
          if (emoticons[x][y].isSwapping()) {
            emoticonsSwapping = true;
            emoticons[x][y].updateSwapping();
          }
        }
      }
      if (!emoticonsSwapping) {
        if (gameState == gameStates.revertingSwap) {
          gameState = gameStates.mainLooping;
        } else if (gameState == gameStates.swapping) {
          gameState = gameStates.findingMatches;
        } else {
          console.log("Error");
        }
      }
    }

    function updateDrops() {
      var emoticonsDropping = false;

      for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
        for (let x = ROW_START; x < X_MAX; x++) {
          if (emoticons[x][y].isDropping()) {
            emoticonsDropping = true;
            emoticons[x][y].updateDropping();
          }
        }
      }
      if (!emoticonsDropping) {
        if (gameState == gameStates.introducingEmoticons) {
          gameState = gameStates.mainLooping;
        } else {
          gameState = gameStates.checkingForAdditionalMatches;
        }
      }
    }

    return {
      startGame: startGame,
    };
  }(); // end of gameView

  boardImpl = function() {

    function swapSelectedEmoticons() {

      var sel1 = selections.getSelection01();
      var sel2 = selections.getSelection02();

      var emo01X = emoticons[sel1[X]][sel1[Y]].getArrayX();
      var emo01Y = emoticons[sel1[X]][sel1[Y]].getArrayY();
      var newEmoticon2 = emoticons[sel1[X]][sel1[Y]];

      var emo02X = emoticons[sel2[X]][sel2[Y]].getArrayX();
      var emo02Y = emoticons[sel2[X]][sel2[Y]].getArrayY();

      emoticons[sel1[X]][sel1[Y]] = emoticons[sel2[X]][sel2[Y]];
      emoticons[sel1[X]][sel1[Y]].setArrayX(emo01X);
      emoticons[sel1[X]][sel1[Y]].setArrayY(emo01Y);

      emoticons[sel2[X]][sel2[Y]] = newEmoticon2;
      emoticons[sel2[X]][sel2[Y]].setArrayX(emo02X);
      emoticons[sel2[X]][sel2[Y]].setArrayY(emo02Y);

      // values now swapped, now move screen position to reflect this
      var e1 = emoticons[sel1[X]][sel1[Y]];
      var e2 = emoticons[sel2[X]][sel2[Y]];

      if (e1.getArrayX() == e2.getArrayX()) {
        if (e1.getArrayY() < e2.getArrayY()) {
          e1.setSwappingUp(true);
          e2.setSwappingDown(true);
        } else {
          e2.setSwappingUp(true);
          e1.setSwappingDown(true);
        }
      } else if (e1.getArrayY() == e2.getArrayY()) {
        if (e1.getArrayX() < e2.getArrayX()) {
          e1.setSwappingLeft(true);
          e2.setSwappingRight(true);
        } else {
          e2.setSwappingLeft(true);
          e1.setSwappingRight(true);
        }
      }
      if (gameState == gameStates.handlingSelection) {
        gameState = gameStates.swapping;
      }
    }

    function findMatches() {
      matchingXList = findVerticalMatches();
      matchingYList = findHorizontalMatches();
      console.log("in findMatches(). matchingYList = " + matchingYList.length + " and matchingXList =" + matchingXList.length);
    }

    function swapBack() {
      gameState = gameStates.revertingSwap;
      sounds.swap_back.play();
      swapSelectedEmoticons();
    }

    function findVerticalMatches() {
      var consecutiveEmoticons = [];
      var listOfMatches = [];
      var emoticon;
      var lastEmoType;

      for (let x = ROW_START; x < X_MAX; x++) {
        consecutiveEmoticons.push(emoticons[x][COLUMN_BOTTOM]);

        for (let y = (COLUMN_BOTTOM - 1); y >= COLUMN_TOP; y--) {
          emoticon = emoticons[x][y];
          lastEmoType = consecutiveEmoticons[consecutiveEmoticons.length - 1].getEmoticonType();
          if (emoticon.getEmoticonType() != lastEmoType) {
            examineList(consecutiveEmoticons, listOfMatches);
            consecutiveEmoticons = [];
          }
          consecutiveEmoticons.push(emoticon);
          if (y == COLUMN_TOP) {
            examineList(consecutiveEmoticons, listOfMatches);
            consecutiveEmoticons = [];
          }
        }
      }
      return listOfMatches;
    }

    function findHorizontalMatches() {
      var consecutiveEmoticons = [];
      var listOfMatches = [];
      var emoticon;
      var lastEmoType;

      for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
        consecutiveEmoticons.push(emoticons[ROW_START][y]);

        for (let x = (ROW_START + 1); x < X_MAX; x++) {
          emoticon = emoticons[x][y];
          lastEmoType = consecutiveEmoticons[consecutiveEmoticons.length - 1].getEmoticonType();
          if (emoticon.getEmoticonType() != lastEmoType) {
            examineList(consecutiveEmoticons, listOfMatches);
            consecutiveEmoticons = [];
          }
          consecutiveEmoticons.push(emoticon);
          if (x == (X_MAX - 1)) {
            examineList(consecutiveEmoticons, listOfMatches);
            consecutiveEmoticons = [];
          }
        }
      }
      return listOfMatches;
    }

    function examineList(consecutiveEmotions, listOfMatches) {
      if ((consecutiveEmotions.length >= 3) && (allSameType(consecutiveEmotions))) {
        listOfMatches.push(consecutiveEmotions);
      }
    }

    function allSameType(consecutiveEmoticons) {
      var consecutiveEmoLength = consecutiveEmoticons.length;
      var nextEmoticonType;
      var previousEmoticonType = consecutiveEmoticons[0].getEmoticonType();

      for (let i = 1; i < consecutiveEmoLength; i++) {
        nextEmoticonType = consecutiveEmoticons[i].getEmoticonType();
        if ((nextEmoticonType == EMPTY) || (nextEmoticonType != previousEmoticonType)) {
          return false;
        } else {
          previousEmoticonType = nextEmoticonType;
        }
      }
      return true;
    }

    function matchesFound() {
      return (!(matchingYList.length === 0 && matchingXList.length === 0));
    }

    function playAudio() {
      var firstMatchingType;
      if (matchingYList.length !== 0) {
        firstMatchingType = matchingYList[0][0].getEmoticonType();
      } else if (matchingXList.length !== 0) {
        firstMatchingType = matchingXList[0][0].getEmoticonType();
      }
      playCorrectAudio(firstMatchingType);
    }

    function playCorrectAudio(firstMatchingType) {
      switch (firstMatchingType) {
        case ANGRY:
          sounds.angry.play();
          break;
        case DELIGHTED:
          sounds.delighted.play();
          break;
        case EMBARRASSED:
          sounds.embarrassed.play();
          break;
        case SURPRISED:
          sounds.surprised.play();
          break;
        case UPSET:
          sounds.upset.play();
          break;
        default:
          break;
      }
    }

    // Called when no possible matches can be made and game reset
    function setToDrop() {
      for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
        for (let x = ROW_START; x < X_MAX; x++) {
          emoticons[x][y].setArrayY(Y_MAX);
          emoticons[x][y].setPixelMovement(10);
          emoticons[x][y].setDropping(true);
        }
      }
    }

    function removeFromBoard(matches) {
      var matchesLength = matches.length;
      var removeList;
      var removeListLength;
      var xVal, yVal;

      for (let i = 0; i < matchesLength; i++) {
        removeList = matches[i];
        removeListLength = removeList.length;
        for (let j = 0; j < removeListLength; j++) {
          xVal = removeList[j].getArrayX();
          yVal = removeList[j].getArrayY();
          if (emoticons[xVal][yVal].getEmoticonType() != EMPTY) {
            emoticons[xVal][yVal] = boardPopulator.getEmptyEmoticon(xVal, yVal);
          }
        }
      }
    }

    function dropEmoticons() {
      console.log("dropEmoticons() gameState: " + gameState);
      var offScreenStartPosition;
      var runnerY;
      var tempY;

      for (let x = ROW_START; x < X_MAX; x++) {
        offScreenStartPosition = -1;
        for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
          if (emoticons[x][y].getEmoticonType() == EMPTY) {
            runnerY = y;
            while ((runnerY >= COLUMN_TOP) && (emoticons[x][runnerY].getEmoticonType() == EMPTY)) {
              runnerY--;
            }
            if (runnerY >= COLUMN_TOP) {
              tempY = emoticons[x][y].getArrayY();
              emoticons[x][y] = emoticons[x][runnerY];
              emoticons[x][y].setArrayY(tempY);
              emoticons[x][y].setDropping(true);
              emoticons[x][runnerY] = boardPopulator.getEmptyEmoticon(x, runnerY);
            } else {
              emoticons[x][y] = boardPopulator.generateEmoticon(x, y, offScreenStartPosition);
              offScreenStartPosition--;
            }
          }
        }
      }
    }

    function matchAvailable() {
      return (verticalMatchAvailable() || horizontalMatchAvailable());
    }

    function verticalMatchAvailable() {
      var type;
      for (let x = ROW_START; x < X_MAX; x++) {
        for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {

          type = emoticons[x][y].getEmoticonType();

          if ((y - 1 >= COLUMN_TOP &&
              emoticons[x][y - 1].getEmoticonType() == type &&
              verticalA(type, x, y)) ||
            (y - 2 >= COLUMN_TOP &&
              emoticons[x][y - 2].getEmoticonType() == type &&
              verticalB(type, x, y))) {
            return true;
          }
        }
      }
      return false;
    }

    function verticalA(type, x, y) {
      return ((y - 2 >= COLUMN_TOP && verticalAboveA(type, x, y)) ||
        (y + 1 <= COLUMN_BOTTOM && verticalBelowA(type, x, y)));
    }

    /**
     * The condition that '(y - 2) must be higher than
     * COLUMN_TOP' was checked in the calling method
     */
    function verticalAboveA(type, x, y) {
      return ((y - 3 >= COLUMN_TOP && emoticons[x][y - 3].getEmoticonType() == type) ||
        (x - 1 >= ROW_START && emoticons[x - 1][y - 2].getEmoticonType() == type) ||
        (x + 1 < X_MAX && emoticons[x + 1][y - 2].getEmoticonType() == type));
    }

    /**
     * The condition that (y + 1) must be less than
     * COLUMN_BOTTOM was checked in the calling method
     */
    function verticalBelowA(type, x, y) {
      return ((y + 2 <= COLUMN_BOTTOM && emoticons[x][y + 2].getEmoticonType() == type) ||
        (x - 1 >= ROW_START && emoticons[x - 1][y + 1].getEmoticonType() == type) ||
        (x + 1 < X_MAX && emoticons[x + 1][y + 1].getEmoticonType() == type));
    }

    function verticalB(type, x, y) {
      return ((x - 1 >= ROW_START && emoticons[x - 1][y - 1].getEmoticonType() == type) ||
        (x + 1 < X_MAX && emoticons[x + 1][y - 1].getEmoticonType() == type));
    }

    function horizontalMatchAvailable() {
      var type;
      for (let y = COLUMN_BOTTOM; y >= COLUMN_TOP; y--) {
        for (let x = ROW_START; x < X_MAX; x++) {

          type = emoticons[x][y].getEmoticonType();

          if ((x + 1 < X_MAX &&
              emoticons[x + 1][y].getEmoticonType() == type &&
              horizontalA(type, x, y)) ||
            (x + 2 < X_MAX && emoticons[x + 2][y].getEmoticonType() == type &&
              horizontalB(type, x, y))) {
            return true;
          }
        }
      }
      return false;
    }

    function horizontalA(type, x, y) {
      return ((x + 2 < X_MAX && horizontalRightA(type, x, y)) ||
        (x - 1 >= ROW_START && horizontalLeftA(type, x, y)));
    }

    /**
     * The condition that (x + 2) must be above
     * below X_MAX was checked in the calling method
     */
    function horizontalRightA(type, x, y) {
      return ((x + 3 < X_MAX && emoticons[x + 3][y].getEmoticonType() == type) ||
        (y - 1 >= COLUMN_TOP && emoticons[x + 2][y - 1].getEmoticonType() == type) ||
        (y + 1 <= COLUMN_BOTTOM && emoticons[x + 2][y + 1].getEmoticonType() == type));
    }

    /**
     * The condition that (x - 1) must be above equal to or
     * above  ROW_START was checked in the calling method
     */
    function horizontalLeftA(type, x, y) {
      return ((x - 2 >= ROW_START && emoticons[x - 2][y].getEmoticonType() == type) ||
        (y - 1 >= COLUMN_TOP && emoticons[x - 1][y - 1].getEmoticonType() == type) ||
        (y + 1 <= COLUMN_BOTTOM && emoticons[x - 1][y + 1].getEmoticonType() == type));
    }

    function horizontalB(type, x, y) {
      return ((y - 1 >= COLUMN_TOP && emoticons[x + 1][y - 1].getEmoticonType() == type) ||
        (y + 1 <= COLUMN_BOTTOM && emoticons[x + 1][y + 1].getEmoticonType() == type));
    }

    return {
      swapSelectedEmoticons: swapSelectedEmoticons,
      swapBack: swapBack,
      findMatches: findMatches,
      matchesFound: matchesFound,
      playAudio: playAudio,
      removeFromBoard: removeFromBoard,
      dropEmoticons: dropEmoticons

    };
  }(); // end of boardImpl

  // boardPopulator
  boardPopulator = function() {
    console.log("in boardPopulator()");
    var angryImage,
      delightedImage,
      embarrassedImage,
      surprisedImage,
      upsetImage,
      emptyImage,
      imagesStillLoading = 0;

    function populateBoard() {
      console.log("in populateBoard()");
      var dropGap, newEmoticon;
      createImages();
      for (let x = ROW_START; x < X_MAX; x++) {
        dropGap = Y_MAX * 2;
        emoticons[x] = [];

        for (let y = COLUMN_TOP; y < Y_MAX; y++) {
          do {
            newEmoticon = generateEmoticon(x, y, ((y - Y_MAX) - dropGap));
          } while ((y >= 2 &&
              newEmoticon.getEmoticonType() == emoticons[x][y - 1].getEmoticonType() &&
              newEmoticon.getEmoticonType() == emoticons[x][y - 2].getEmoticonType()) ||
            (x >= 2 &&
              newEmoticon.getEmoticonType() == emoticons[x - 1][y].getEmoticonType() &&
              newEmoticon.getEmoticonType() == emoticons[x - 2][y].getEmoticonType()));
          dropGap--;
          emoticons[x][y] = newEmoticon;
        }
      }
    }

    function createImages() {
      angryImage = loadImage("images/angry.png");
      delightedImage = loadImage("images/delighted.png");
      embarrassedImage = loadImage("images/embarrassed.png");
      surprisedImage = loadImage("images/surprised.png");
      upsetImage = loadImage("images/upset.png");
      emptyImage = loadImage("images/empty_tile.png");
    }

    function loadImage(imageSrc) {
      var image = new Image();
      image.src = imageSrc;
      imagesStillLoading++;
      image.onload = function() {
        imagesStillLoading--;
      };
      return image;
    }

    function generateEmoticon(x, y, offScreenStartPositionY) {
      var randomValue = Math.floor(Math.random() * 5); // may need + 1?
      switch (randomValue) {
        case 0:
          return new Emoticon(x, y, angryImage, ANGRY, offScreenStartPositionY);
        case 1:
          return new Emoticon(x, y, delightedImage, DELIGHTED, offScreenStartPositionY);
        case 2:
          return new Emoticon(x, y, embarrassedImage, EMBARRASSED, offScreenStartPositionY);
        case 3:
          return new Emoticon(x, y, surprisedImage, SURPRISED, offScreenStartPositionY);
        case 4:
          return new Emoticon(x, y, upsetImage, UPSET, offScreenStartPositionY);
        default:
          break;
      }
    }

    function getEmptyEmoticon(x, y) {
      var emptyEmoticon = new Emoticon(x, y, emptyImage, EMPTY, y);
      emptyEmoticon.setDropping(false);
      return emptyEmoticon;
    }

    return {
      populateBoard: populateBoard,
      generateEmoticon: generateEmoticon,
      getEmptyEmoticon: getEmptyEmoticon
    };
  }(); // end of boardPopulator

  // selections
  selections = function() {
    var selection01Made = false;

    function resetUserSelections() {
      selection01[X] = -1;
      selection01[Y] = -1;
      selection01Made = false;
      selection02[X] = -1;
      selection02[Y] = -1;
    }

    function selection01IsMade() {
      return selection01Made;
    }

    function getSelection01() {
      return selection01;
    }

    function setSelection01(x, y) {
      console.log("in setSelection01 function");
      selection01[X] = x;
      selection01[Y] = y;
      selection01Made = true;
    }

    function getSelection02() {
      return selection02;
    }

    function setSelection02(x, y) {
      console.log("in setSelection02 function");
      selection02[X] = x;
      selection02[Y] = y;
    }

    function sameSelectionMadeTwice() {
      console.log("in sameSelectionMadeTwice function");
      return (selection01[X] == selection02[X] && selection01[Y] == selection02[Y]);
    }

    function adjacentSelections() {
      console.log("in adjacentSelections function");
      if ((selection01[X] == selection02[X]) &&
        (selection01[Y] == (selection02[Y] + 1) || selection01[Y] == (selection02[Y] - 1))) {
        return true;
      } else if ((selection01[Y] == selection02[Y]) &&
        (selection01[X] == (selection02[X] + 1) || selection01[X] == (selection02[X] - 1))) {
        return true;
      }
      return false;
    }

    function setSelection02ToSelection01() {
      console.log("setSelection02ToSelection01");
      selection01[X] = selection02[X];
      selection01[Y] = selection02[Y];
      selection02[X] = -1;
      selection02[Y] = -1;
    }

    return {
      setSelection01: setSelection01,
      getSelection01: getSelection01,
      selection01IsMade: selection01IsMade,
      setSelection02: setSelection02,
      getSelection02: getSelection02,
      sameSelectionMadeTwice: sameSelectionMadeTwice,
      adjacentSelections: adjacentSelections,
      setSelection02ToSelection01: setSelection02ToSelection01,
      resetUserSelections: resetUserSelections
    };
  }(); // end of selections

  // emoticon constructor function
  function Emoticon(arrayX, arrayY, image, emoticonType, offScreenStartPositionY) {
    this.arrayX = arrayX;
    this.arrayY = arrayY;
    this.image = image;
    this.emoticonType = emoticonType;
    this.screenPositionX = (arrayX * EMO_WIDTH);
    this.screenPositionY = (offScreenStartPositionY * EMO_HEIGHT);
    this.pixelMovement = 10; //(EMO_HEIGHT / 8);
    this.dropping = true;
    this.swappingUp = false;
    this.swappingDown = false;
    this.swappingRight = false;
    this.swappingLeft = false;
  }

  Emoticon.prototype.isSwapping = function() {
    if (this.swappingUp) {
      return true;
    } else if (this.swappingDown) {
      return true;
    } else if (this.swappingLeft) {
      return true;
    } else if (this.swappingRight) {
      return true;
    } else {
      return false;
    }
  };

  Emoticon.prototype.updateSwapping = function() {
    if (this.swappingUp) {
      this.swapUp();
    } else if (this.swappingDown) {
      this.swapDown();
    } else if (this.swappingRight) {
      this.swapRight();
    } else if (this.swappingLeft) {
      this.swapLeft();
    }
  };

  Emoticon.prototype.isDropping = function() {
    return this.dropping;
  };

  Emoticon.prototype.updateDropping = function() {
    if (this.dropping) {
      this.dropEmoticon();
    }
  };

  Emoticon.prototype.setDropping = function(bool) {
    this.dropping = bool;
  };

  Emoticon.prototype.dropEmoticon = function() {
    var newPosition = (this.arrayY * EMO_HEIGHT);
    var pixelRate = this.pixelMovement;
    while (this.screenPositionY + pixelRate > newPosition && pixelRate >= 2) {
      pixelRate /= DIVISOR;
    }
    this.screenPositionY += pixelRate;
    if (this.screenPositionY >= newPosition) {
      this.dropping = false;
    }
  };

  Emoticon.prototype.setSwappingUp = function(bool) {
    this.swappingUp = bool;
  };

  Emoticon.prototype.swapUp = function() {
    var newPosition = EMO_HEIGHT * this.arrayY;
    var pixelRate = this.pixelMovement;
    while (this.screenPositionY - pixelRate < newPosition && pixelRate >= 2) {
      pixelRate /= DIVISOR;
    }
    this.screenPositionY -= pixelRate;
    if (this.screenPositionY <= newPosition) {
      this.swappingUp = false;
    }
  };

  Emoticon.prototype.setSwappingDown = function(bool) {
    this.swappingDown = bool;
  };

  Emoticon.prototype.swapDown = function() {
    var newPosition = EMO_HEIGHT * this.arrayY;
    var pixelRate = this.pixelMovement;
    while (this.screenPositionY + pixelRate > newPosition && pixelRate >= 2) {
      pixelRate /= DIVISOR;
    }
    this.screenPositionY += pixelRate;
    if (this.screenPositionY >= newPosition) {
      this.swappingDown = false;
    }
  };

  Emoticon.prototype.setSwappingRight = function(bool) {
    this.swappingRight = bool;
  };

  Emoticon.prototype.swapRight = function() {
    var newPosition = EMO_WIDTH * this.arrayX;
    var pixelRate = this.pixelMovement;
    while (this.screenPositionX + pixelRate > newPosition && pixelRate >= 2) {
      pixelRate /= DIVISOR;
    }
    this.screenPositionX += pixelRate;
    if (this.screenPositionX >= newPosition) {
      this.swappingRight = false;
    }
  };

  Emoticon.prototype.setSwappingLeft = function(bool) {
    this.swappingLeft = bool;
  };

  Emoticon.prototype.swapLeft = function() {
    var newPosition = EMO_WIDTH * this.arrayX;
    var pixelRate = this.pixelMovement;
    while (this.screenPositionX - pixelRate < newPosition && pixelRate >= 2) {
      pixelRate /= DIVISOR;
    }
    this.screenPositionX -= pixelRate;
    if (this.screenPositionX <= newPosition) {
      this.swappingLeft = false;
    }
  };

  Emoticon.prototype.getArrayX = function() {
    return this.arrayX;
  };

  Emoticon.prototype.setArrayX = function(arrayX) {
    this.arrayX = arrayX;
  };

  Emoticon.prototype.getArrayY = function() {
    return this.arrayY;
  };

  Emoticon.prototype.setArrayY = function(arrayY) {
    this.arrayY = arrayY;
  };

  Emoticon.prototype.getViewPositionX = function() {
    return this.screenPositionX;
  };

  Emoticon.prototype.getViewPositionY = function() {
    return this.screenPositionY;
  };

  Emoticon.prototype.getImage = function() {
    return this.image;
  };

  Emoticon.prototype.getEmoticonType = function() {
    return this.emoticonType;
  };

  Emoticon.prototype.setPixelMovement = function(pixelMovement) {
    this.pixelMovement = pixelMovement;
  }; // last Emoticon method


  gameView.startGame();
}
