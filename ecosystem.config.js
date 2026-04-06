module.exports = {
  apps: [
    {
      name: "server",
      script: "server.js",
      watch: true,
      env: {
        NODE_ENV: "development"
      }
    },
    {
      name: "client",
      script: "pnpm",
      args: "run dev:client",
      env: {
        NODE_ENV: "development"
      }
    },
    {
      name: "crdb",
      script: "crdb.js",
      watch: true,
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};