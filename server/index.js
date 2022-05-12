import express from 'express';
import cors from 'cors';
import { Sequelize } from 'sequelize';
import fetch from 'node-fetch';

// Provision database
const sequelize = new Sequelize('database', '', '', {
  dialect: 'sqlite',
  storage: '.data/database.sqlite',
  logging: false,
});

const LoginAttempt = sequelize.define('login-attempt', {
  visitorId: {
    type: Sequelize.STRING,
  },
  userName: {
    type: Sequelize.STRING,
  },
  timestamp: {
    type: Sequelize.DATE,
  },
  loginAttemptResult: {
    type: Sequelize.STRING,
  },
});

LoginAttempt.sync({ force: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/authenticate', async (req, res) => {
  // Get requestId and visitorId from the client
  const visitorId = req.body.visitorId;
  const requestId = req.body.requestId; //.replace(/.$/, 'a');
  const userName = req.body.userName;
  const password = req.body.password;

  // Get data about identification from FingerprintJS Pro Servers
  const visitorData = await getVisitorData(visitorId, requestId);

  res.setHeader('Content-Type', 'application/json');

  // VisitorId does not match to requestId
  if (visitorData.visits.length === 0) {
    // Report suspicious user activity according to internal processes here

    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.RequestIdMissmatch
    );
    return getForbiddenReponse(
      res,
      'Hmmm, sneaky trying to forge information from the client-side, no luck this time, no login attempt was performed.'
    );
  }
  //#endregion

  //#region Check confidence score
  if (visitorData.visits[0].confidence.score < 0.99) {
    // Report suspicious user activity according to internal processes here

    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.LowConfidenceScore
    );

    return getForbiddenReponse(
      res,
      "Low confidence score, we'd rather verify you with the second factor"
    );
  }
  //#endregion

  //#region Check age of requestId
  if (new Date().getTime() - visitorData.visits[0].timestamp > 5000) {
    // Report suspicious user activity according to internal processes here

    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.OldTimestamp
    );

    return getForbiddenReponse(
      res,
      'Old requestId detected. Login attempt ignored and logged.'
    );
  }
  //#endregion

  //#region Check all unsuccessful attempt during last 24 hours
  // Get all unsuccessful attempts during last 24 hours
  const visitorLoginAttemptCountQueryResult =
    await LoginAttempt.findAndCountAll({
      where: {
        visitorId: visitorData.visitorId,
        timestamp: {
          [Sequelize.Op.gt]: new Date().getTime() - 24 * 60 * 1000, // 24 hours
        },
        loginAttemptResult: {
          [Sequelize.Op.not]: loginAttemptResult.Passed,
          [Sequelize.Op.not]: loginAttemptResult.TooManyAttempts,
        },
      },
    });

  // Trying credentials, if visitorId performed 5 unsuccessful login attempts during the last 24 hours, do not perform login
  if (visitorLoginAttemptCountQueryResult.count > 4) {
    // Report suspicious user activity according to internal processes here

    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.TooManyAttempts
    );

    return getForbiddenReponse(
      res,
      'You had more than 5 attempts during the last 24 hours. This login attempt was not performed.'
    );

    // return res.status(403).end(
    //   JSON.stringify({
    //     message:
    //       'You had more than 5 attempts during the last 24 hours. This login attempt was not performed.',
    //   })
    // );
  }
  //#endregion

  //#region Check provided credentials
  if (areCredentialsCorrect(userName, password)) {
    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.Passed
    );

    return getOkReponse(res);
  } else {
    await logLoginAttempt(
      visitorData.visitorId,
      userName,
      loginAttemptResult.IncorrectCredentials
    );

    return getForbiddenReponse(res, 'Incorrect credentials, try again.');
    // return res.status(403).end(
    //   JSON.stringify({
    //     message: 'Incorrect credentials, try again.',
    //   })
    // );
  }
  //#endregion
});

// Why we want to check it on server side
async function getVisitorData(visitorId, requestId) {
  // There are different Base URLs for different regions: https://dev.fingerprintjs.com/docs/server-api#regions
  const fingerprintJSProServerApiUrl = new URL(
    `https://api.fpjs.io/visitors/${visitorId}`
  );

  fingerprintJSProServerApiUrl.searchParams.append(
    'api_key',
    'F6gQ8H8vQLc7mVsVKaFx' // In the real world use-case we recommend using Auth-API-Key header instead: https://dev.fingerprintjs.com/docs/server-api#api-methods
  );
  fingerprintJSProServerApiUrl.searchParams.append('request_id', requestId);

  const visitorServerApiResponse = await fetch(
    fingerprintJSProServerApiUrl.href
  );

  return await visitorServerApiResponse.json();

  // Alternatively, on the Node.js environment one can use Server API Node.js library: https://github.com/fingerprintjs/fingerprintjs-pro-server-api-node-sdk
  // const client = new FingerprintJsServerApiClient({
  //   region: Region.Global,
  //   apiKey: 'F6gQ8H8vQLc7mVsVKaFx', // In real-world apps api token should be stored in the environment variables
  //   authenticationMode: AuthenticationMode.QueryParameter,
  // });

  // const serverApiFilter = { request_id: requestId };
  // const visitorData = await client.getVisitorHistory(
  //   visitorId,
  //   serverApiFilter
  // );
  // return visitorData;
}

const loginAttemptResult = Object.freeze({
  LowConfidenceScore: 'LowConfidenceScore',
  RequestIdMissmatch: 'RequestIdMissmatch',
  OldTimestamp: 'OldTimestamp',
  TooManyAttempts: 'TooManyAttempts',
  IncorrectCredentials: 'IncorrectCredentials',
  Passed: 'Passed',
});

// Dummy action simulating authentication
function areCredentialsCorrect(name, password) {
  if (name === 'user' && password === 'password') return true;
  return false;
}

async function logLoginAttempt(visitorId, userName, loginAttemptResult) {
  await LoginAttempt.create({
    visitorId,
    userName,
    timestamp: new Date().getTime(),
    loginAttemptResult,
  });
  await sequelize.sync();
}

function getOkReponse(res) {
  return res.status(200).end(
    JSON.stringify({
      message: 'We logged you in successfully.',
    })
  );
}

function getForbiddenReponse(res, message) {
  return res.status(403).end(
    JSON.stringify({
      message,
    })
  );
}

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
