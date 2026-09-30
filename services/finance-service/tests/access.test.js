jest.mock("../src/db/connection", () => ({
  query: jest.fn().mockResolvedValue([[]])
}));

const request = require("supertest");
const app = require("../src/app");

describe("Finance API access", () => {
  test("rejects requests without gateway identity headers", async () => {
    const res = await request(app).get("/api/v1/finance/invoices");
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  test("rejects students", async () => {
    const res = await request(app).get("/api/v1/finance/invoices")
      .set("x-user-id", "u1").set("x-user-role", "STUDENT");
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("lets a super admin list invoices", async () => {
    const res = await request(app).get("/api/v1/finance/invoices")
      .set("x-user-id", "u1").set("x-user-role", "SUPER_ADMIN");
    expect(res.statusCode).toBe(200);
  });

  test("unknown routes answer JSON 404", async () => {
    const res = await request(app).get("/api/v1/finance/nope")
      .set("x-user-id", "u1").set("x-user-role", "ADMIN");
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
