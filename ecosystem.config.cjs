module.exports = {
  apps: [
    {
      name: 'social-poster',
      cwd: '/home/chanclaw/.openclaw/workspace/social-poster',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
