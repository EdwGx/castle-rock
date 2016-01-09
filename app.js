var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var port = process.env.PORT || 3000;

var questions = []
var state = "idle"
var adminSocket;
var userSockets = {};
var userCount = 0;
var ballots = [0,0];
var results = [];
var questionCounter = 0;
var current_quesiton;
//idle, wait, show, result, end

function resetGame() {
  questions = [
    ["Your enemies are closing in to your tribe","Notify Others","Welcome them"],
    ["Ralph blows the conch","Scare him","Talk to him"],
    ["Ralph asks for an assembly","Throw a small stone between the twins","Listen to him"],
    ["Ralph asks you to return Piggy's glasses","Deny it","Return the glasses"],
    ["Ralph calls you a theif","Stab him","Talk to him"],
    ["Your Cheif is fighting with your enemy","Cheer for your Cheif","Stop the fighting"],
    ["Your enemy stops fighting, and explains to you smoke is the only way to leave the island", "Send them back", "Listen to them"],
    ["Your Cheif shouts you to tie your enemies up","Tie them up","Refuse"],
    ["Piggy shouts, \"I got th conch!\"","Throw stones","Slience"],
    ["Your enemy says you are hunting and breaking things up","Yell at him","He is right"],
    ["A rock can be dropped on your enemy", "Let the rock fall", "No"],
    ["Another enemy is running away", "Throw spears at him", "Let him go"]
  ];

  userSockets = {};
  userCount = 0;
  results = [];

  questionCounter = 0;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/d', function(req, res){
  res.sendFile(__dirname + '/dashboard.html');
});

io.on('connection', function(socket){
  console.log('new user connected');

  socket.admin = false;

  socket.on('add admin', function(msg){
    console.log('add admin');
    adminSocket = socket;
    socket.admin = true;

    socket.on('start wait', function(msg){
      console.log('start wait');
      resetGame();
      state = 'wait';
      socket.emit('ok wait', '');
    });

    socket.on('start show', function(msg){
      console.log('start show');
      if (questions.length > 0) {
        state = 'show'
        ballots = [0,0];
        questionCounter += 1;
        var question = questions.shift();
        current_quesiton = question;
        socket.emit('ok show', [question, userCount]);
        socket.broadcast.emit('show question', question);
      } else {
        var arr = [];
        for (name in userSockets) {
          var user = userSockets[name];
          arr.push([user.score, user.hunterName])
        }
        if (arr.length == 0) {
          winnersDescription = ''
        } else {
          arr.sort();
          var winnerNames = [];
          var highest = arr[0][0]
          for (var i = 0; i < arr.length; i++){
            var userSc = userSockets[arr[i][1]];
            if (arr[i][0] == highest) {
              userSc.emit('end', userSc.hunterName + '<br>You have the highest score!');
              userSc.disconnect();
              winnerNames.push(arr[i][1]);
            } else {
              userSc.emit('end','Thank you for playing');
              userSc.disconnect();
            }
          }
          var winnersDescription;
          if (winnerNames.length > 1) {
            winnersDescription = winnerNames.join(', ') + ' have the highest score!';
          } else {
            winnersDescription = winnerNames[0] + ' has the highest score!';
          }
        }
        socket.emit('end', [winnersDescription, results]);
      }
    });

    socket.on('start result', function(msg){
      console.log('start result');
      results.push(current_quesiton.concat(ballots));
      state = 'result';
      var modBallots = [0,0];
      if (ballots[0] > ballots[1]) {
        modBallots[0] = ballots[0];
        modBallots[1] = ballots[1];
      } else if (ballots[0] < ballots[1]) {
        if (ballots[0] == 0) {
          modBallots[0] = ballots[1] - 1;
          modBallots[1] = 1;
        } else {
          modBallots[0] = ballots[1];
          modBallots[1] = ballots[0];
        }
      } else {
        modBallots[0] = ballots[0] + 1;
        modBallots[1] = ballots[1] - 1;
      }

      var noAnswerNames = [];
      var wrongAnswerNames = [];
      var removedOnePlayer = (Math.random() < 0.80) || (userCount < 3);
      console.log('removedOnePlayer', removedOnePlayer);

      for (name in userSockets) {
        var user = userSockets[name];
        if (user.results.length != questionCounter) {
          noAnswerNames.push(user.hunterName);
          user.emit('reject no_answer');
          user.disconnect();
        } else if (user.results[user.results.length - 1] == 1 && !removedOnePlayer) {
          removedOnePlayer = true;
          wrongAnswerNames.push(user.hunterName);
          user.emit('reject wrong_answer');
          user.disconnect();
        } else {
          user.emit('show result', user.score);
        }
      }
      socket.emit('ok result', [current_quesiton, modBallots, noAnswerNames, wrongAnswerNames]);
    });
  });

  socket.on('add user', function(msg){
    if (state != 'wait') {
      socket.emit('reject');
      return;
    }
    var ub = 25;
    var name;
    var number;
    do {
      number = getRandomInt(1,ub);
      name = "Hunter " + number;
      ub += 2;
    } while (name in userSockets)

    socket.hunterName = name;
    socket.number = number;
    userCount += 1;
    userSockets[name] = socket;

    socket.results = [];
    socket.score = 0;

    console.log('add user (n=' + userCount + ')');
    socket.emit('ok user', name);
    adminSocket.emit('new user', [name, number]);

    socket.on('submit answer', function(msg){
      if (msg == 0) {
        socket.score += 1;
      }
      ballots[msg] += 1;
      socket.results.push(msg);
      adminSocket.emit('new answer', [ ballots[0] + ballots[1] ,userCount]);
    });
  });

  socket.on('disconnect', function() {
    if (socket.admin) {
      adminSocket = null;
    } else if (socket.hunterName) {
      if (socket.hunterName in userSockets) {
        if (state == "wait") {
          if (adminSocket){
            adminSocket.emit('remove user', socket.number);
          }
        }

        userCount -= 1;
        console.log('delete user (n=' + userCount+ ')');
        delete userSockets[socket.hunterName];
      }
    } else {
      console.log('user disconnected')
    }
  })
});

http.listen(port, function() {
    console.log('App is running on http://localhost:' + port);
});
