const ADMIN_SLACK_USER_ID = 'U0ABLSVUZ41';

function isAdminSlackUser(slackUserId) {
  return String(slackUserId || '') === ADMIN_SLACK_USER_ID;
}

module.exports = {
  ADMIN_SLACK_USER_ID,
  isAdminSlackUser,
};
