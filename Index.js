const express = require("express");
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
    console.log("🔥 Webhook received:");
    console.log(req.body);

    res.sendStatus(200);
});

app.get("/", (req, res) => {
    res.send("Webhook server is alive");
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log("Server running on port", port);
});
