const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const format = require("date-fns/format");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server is running at host http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error:${error.message}`);
  }
};

initializeDBAndServer();

//logger middle ware
const validateLogin = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "RevathiVemula709", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getExistedUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const existedUser = await db.get(getExistedUserQuery);
  if (existedUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createNewUserQuery = `
            INSERT INTO user(username,password,name,gender) 
            VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(createNewUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const existedUserQuery = `
    SELECT * 
    FROM 
        user 
    WHERE 
        username = '${username}';`;
  const existedUser = await db.get(existedUserQuery);
  if (existedUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = bcrypt.compare(password, existedUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "RevathiVemula709");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", validateLogin, async (request, response) => {
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const tweetFeedOfFollowingQuery = `
  SELECT DISTINCT(username) AS username,
  tweet, date_time AS dateTime FROM tweet INNER JOIN user 
  ON tweet.user_id = user.user_id INNER JOIN follower 
  ON user.user_id = follower.following_user_id WHERE user.user_id IN
  (SELECT following_user_id FROM follower WHERE follower_user_id = ${user_id}); 
  `;
  const feed = await db.all(tweetFeedOfFollowingQuery);
  response.send(feed);
});

//API 4
app.get("/user/following/", validateLogin, async (request, response) => {
  const { username } = request;
  const existedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(existedUserQuery);
  //console.log(userId);
  const getFollowingQuery = `
    SELECT DISTINCT(name) AS name 
    FROM user 
    INNER JOIN follower ON 
    user.user_id = follower.following_user_id 
    WHERE follower_user_id = ${user_id};`;
  const followingData = await db.all(getFollowingQuery);
  response.send(followingData);
});

//API 5
app.get("/user/followers/", validateLogin, async (request, response) => {
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const getFollowersQuery = `
    SELECT DISTINCT(name) AS name 
    FROM user 
    INNER JOIN follower ON 
    user.user_id = follower.follower_user_id 
    WHERE following_user_id = ${user_id};`;
  const followersData = await db.all(getFollowersQuery);
  response.send(followersData);
});

//API 6
app.get("/tweets/:tweetId/", validateLogin, async (request, response) => {
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  //console.log(user_id);
  const getFollowingTweetsQuery = `
    SELECT tweet_id 
    FROM user 
    INNER JOIN follower ON 
    user.user_id = follower.following_user_id 
    INNER JOIN tweet on user.user_id = tweet.user_id
    WHERE follower_user_id = ${user_id};`;
  const tweetsOfFollowing = await db.all(getFollowingTweetsQuery);
  //convert Object to array of tweet ids
  const tweets = [];
  for (i in tweetsOfFollowing) {
    tweets.push(tweetsOfFollowing[i].tweet_id);
  }
  //console.log(typeof tweetId);
  //console.log(tweets.includes(tweetId));
  if (tweets.includes(tweetId)) {
    const getTheRequestedTweetQuery = `
        SELECT tweet,count(like_id) as likes,count(reply_id) as replies,date_time AS dateTime
        FROM (tweet INNER JOIN like on tweet.tweet_id = like.tweet_id) AS T 
        INNER JOIN reply on tweet.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId};`;
    //console.log(getTheRequestedTweetQuery);
    const tweetData = await db.get(getTheRequestedTweetQuery);
    response.send(tweetData);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get("/tweets/:tweetId/likes/", validateLogin, async (request, response) => {
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const getFollowingTweetsQuery = `
    SELECT tweet_id 
    FROM user 
    LEFT JOIN follower ON 
    user.user_id = follower.following_user_id 
    LEFT JOIN tweet on user.user_id = tweet.user_id
    WHERE follower_user_id = ${user_id};`;
  const tweetsOfFollowing = await db.all(getFollowingTweetsQuery);
  const tweets = [];
  for (i in tweetsOfFollowing) {
    tweets.push(tweetsOfFollowing[i].tweet_id);
  }
  if (tweets.includes(tweetId)) {
    const getLikedUsersQuery = `
      SELECT username 
      FROM user INNER JOIN like 
      ON like.user_id = user.user_id 
      WHERE tweet_id = ${tweetId};`;
    const usersWhoLikedTweet = await db.all(getLikedUsersQuery);
    const likedUsers = [];
    for (i in usersWhoLikedTweet) {
      likedUsers.push(usersWhoLikedTweet[i].username);
    }
    response.send({ likes: likedUsers });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  validateLogin,
  async (request, response) => {
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const { username } = request;
    const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const { user_id } = await db.get(loggedUserQuery);
    const getFollowingTweetsQuery = `
    SELECT tweet_id 
    FROM user 
    LEFT JOIN follower ON 
    user.user_id = follower.following_user_id 
    LEFT JOIN tweet on user.user_id = tweet.user_id
    WHERE follower_user_id = ${user_id};`;
    const tweetsOfFollowing = await db.all(getFollowingTweetsQuery);
    const tweets = [];
    for (i in tweetsOfFollowing) {
      tweets.push(tweetsOfFollowing[i].tweet_id);
    }
    if (tweets.includes(tweetId)) {
      const getNamesAndRepliesOfTweetQuery = `
      SELECT name,reply 
      FROM user INNER JOIN reply 
      ON user.user_id = reply.user_id
      WHERE tweet_id = ${tweetId};`;
      const namesAndReplies = await db.all(getNamesAndRepliesOfTweetQuery);
      response.send({ replies: namesAndReplies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", validateLogin, async (request, response) => {
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const getUserTweetsQuery = `
    SELECT tweet, count(DISTINCT like_id) AS likes,count(DISTINCT reply_id) as replies,date_time AS dateTime
    FROM tweet LEFT JOIN like 
    ON tweet.tweet_id = like.tweet_id 
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
    WHERE tweet.user_id = ${user_id};`;
  const userTweets = await db.all(getUserTweetsQuery);
  response.send(userTweets);
});

//API 10
app.post("/user/tweets/", validateLogin, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const dateTime = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const createNewTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time) 
    VALUES('${tweet}',${user_id},'${dateTime}');`;
  await db.run(createNewTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", validateLogin, async (request, response) => {
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const { username } = request;
  const loggedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const { user_id } = await db.get(loggedUserQuery);
  const getUserTweets = `
    SELECT tweet_id FROM tweet WHERE user_id = ${user_id};`;
  const userTweetsObj = await db.all(getUserTweets);
  const userTweets = [];
  for (i in userTweetsObj) {
    userTweets.push(userTweetsObj[i].tweet_id);
  }
  //user deleted his tweet
  if (userTweets.includes(tweetId)) {
    const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
