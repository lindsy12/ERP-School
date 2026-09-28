jest.mock("../src/db/connection", () => ({
  query: jest.fn().mockResolvedValue([[]])
}));

const request = require("supertest");
const app = require("../src/app");

describe("Finance service", () => {
  test("GET /health returns OK", async () => {
    const response = await request(app).get("/health");
    expect(response.statusCode).toBe(200);
    expect(response.body.service).toBe("finance-service");
    expect(response.body.database).toBe("connected");
  });
});
