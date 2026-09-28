require("dotenv").config();

const app = require("./app");
const { startConsumer } = require("./services/rabbitmq.service");

const PORT = process.env.PORT || 4003;

app.listen(PORT, () => {
  console.log(`Finance service running on port ${PORT}`);
  startConsumer().catch(err => console.warn(`RabbitMQ consumer not started: ${err.message}`));
});
