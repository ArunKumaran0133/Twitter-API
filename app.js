const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeServerAndDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Started...");
    });
  } catch (error) {
    console.log(`Server get an error ${error}`);
    process.exit(1);
  }
};

initializeServerAndDb();

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;

  const Query = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;

  const dbResponse = await db.get(Query);

  if (dbResponse === undefined) {
    if (password.length > 5) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
            INSERT INTO user (name , username , password , gender)
            VALUES (
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            );
          `;
      await db.run(addUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API - 2;

app.post("/login/", async (request, response) => {
  const userDetails = request.body;
  const { username, password } = userDetails;

  const Query = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;

  const dbResponse = await db.get(Query);

  if (dbResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      dbResponse.password
    );
    if (isPasswordCorrect) {
      const jwtToken = jwt.sign(dbResponse, "SECRET");
      response.send({ jwtToken });
    } else {
      response.send("Invalid password");
      response.status(400);
    }
  }
});

// Authentication with JWT...

const authentication = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//API-3

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;
  const Query = `
        SELECT username , tweet , date_time
        FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS t INNER JOIN user ON t.following_user_id = user.user_id
        WHERE t.following_user_id = ${user_id}
        ORDER BY date_time DESC
        LIMIT 4
        OFFSET 0;
    `;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API - 4;

app.get("/user/following/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;

  const userFollowingQuery = `
        SELECT name
        FROM user INNER JOIN  follower ON user.user_id = follower.following_user_id
        WHERE follower.following_user_id = ${user_id};
    `;

  const dbResponse = await db.all(userFollowingQuery);
  response.send(dbResponse);
});

//API - 5

app.get("/user/followers/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;

  const Query = `
        SELECT name 
        FROM user INNER JOIN  follower ON user.user_id = follower.follower_user_id    
        WHERE follower.following_user_id = ${user_id};
    `;

  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API - 6

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;

  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetResult = await db.get(tweetQuery);

  const userFollowersQuery = `
        SELECT *
        FROM follower INNER JOIN user ON follower.following_user_id  = user.user_id
        WHERE follower.follower_user_id = ${user_id};
    `;
  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const getTweetDetailsQuery = `
            SELECT 
            tweet ,
            COUNT(DISTINCT(like.like_id)) AS likes ,
            COUNT(DISTINCT(reply.reply_id)) AS replies ,
            tweet.date_time AS dateTime

            FROM 
            (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS t INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
            tweet.tweet_id=${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};
        `;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API - 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { payload } = request;
    const { tweetId } = request;
    const { user_id, name, username, password, gender } = payload;

    const getLikeUserQuery = `
    SELECT *
    FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN user ON user.user_id = like.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
  `;
    const likedUsers = await db.all(getLikeUserQuery);

    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API - 8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, password, gender } = payload;

    const getReplyUserQuery = `
        SELECT *
        FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = reply.user_id
        WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;
    const repliedUsers = await db.all(getReplyUserQuery);

    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let obj = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(obj);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API - 9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;

  const getTweetsDetailsQuery = `
        SELECT 
            tweet.tweet AS tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM user INNER JOIN tweet ON tweet.user_id = user.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE user.user_id = ${user_id}
        GROUP BY tweet.tweet_id;
    `;

  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});

//API - 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;

  const postTweetQuery = `
        INSERT INTO tweet (tweet , user_id)
        VALUES (
            '${tweet}',
            ${user_id}
        );
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API - 11

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, password, gender } = payload;
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${user_id};`;
  const tweetUser = await db.all(selectUserQuery);

  if (tweetUser.length !== 0) {
    const deleteQuery = `
        DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${user_id};
      `;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Export APP ...
module.exports = app;
