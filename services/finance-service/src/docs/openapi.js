module.exports = {
  openapi: "3.0.3",

  info: {
    title: "Finance Service API",
    version: "1.0.0",
    description: "Finance management API for invoices, payments, expenses, campaigns and reports."
  },

  paths: {
    "/api/v1/finance/invoices": {
      post: {
        summary: "Create invoice",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["studentId", "academicYear", "amount", "dueDate"],
                properties: {
                  studentId: {
                    type: "integer",
                    example: 2
                  },
                  academicYear: {
                    type: "string",
                    example: "2026/2027"
                  },
                  amount: {
                    type: "number",
                    example: 200000
                  },
                  dueDate: {
                    type: "string",
                    format: "date",
                    example: "2026-11-15"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Invoice created successfully"
          },
          400: {
            description: "Validation error"
          }
        }
      },

      get: {
        summary: "List invoices",
        responses: {
          200: {
            description: "List of invoices"
          }
        }
      }
    },

    "/api/v1/finance/payments": {
      post: {
        summary: "Record payment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["invoiceId", "amount", "method"],
                properties: {
                  invoiceId: {
                    type: "integer",
                    example: 1
                  },
                  amount: {
                    type: "number",
                    example: 50000
                  },
                  method: {
                    type: "string",
                    enum: ["CASH", "BANK_TRANSFER", "MOBILE_MONEY"],
                    example: "MOBILE_MONEY"
                  },
                  transactionRef: {
                    type: "string",
                    example: "TEST-MOMO-001"
                  },
                  phoneNumber: {
                    type: "string",
                    example: "670000000"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Payment recorded successfully"
          }
        }
      },

      get: {
        summary: "List payments",
        responses: {
          200: {
            description: "List of payments"
          }
        }
      }
    },

    "/api/v1/finance/payments/momo": {
      post: {
        summary: "Record mock mobile-money payment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["invoiceId", "amount", "phoneNumber"],
                properties: {
                  invoiceId: {
                    type: "integer",
                    example: 1
                  },
                  amount: {
                    type: "number",
                    example: 25000
                  },
                  phoneNumber: {
                    type: "string",
                    example: "670000000"
                  },
                  transactionRef: {
                    type: "string",
                    example: "MOMO-TEST-001"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Mock mobile-money payment recorded"
          }
        }
      }
    },

    "/api/v1/finance/expenses": {
      post: {
        summary: "Create expense",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description", "amount", "expenseDate"],
                properties: {
                  description: {
                    type: "string",
                    example: "Office Supplies"
                  },
                  category: {
                    type: "string",
                    example: "ADMINISTRATION"
                  },
                  amount: {
                    type: "number",
                    example: 30000
                  },
                  expenseDate: {
                    type: "string",
                    format: "date",
                    example: "2026-09-28"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Expense created successfully"
          }
        }
      },

      get: {
        summary: "List expenses",
        responses: {
          200: {
            description: "List of expenses"
          }
        }
      }
    },

    "/api/v1/finance/campaigns": {
      post: {
        summary: "Create campaign",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "budget", "startDate", "endDate"],
                properties: {
                  name: {
                    type: "string",
                    example: "2026 Student Recruitment"
                  },
                  budget: {
                    type: "number",
                    example: 500000
                  },
                  startDate: {
                    type: "string",
                    format: "date",
                    example: "2026-09-01"
                  },
                  endDate: {
                    type: "string",
                    format: "date",
                    example: "2026-12-31"
                  },
                  leads: {
                    type: "integer",
                    example: 100
                  },
                  conversions: {
                    type: "integer",
                    example: 25
                  },
                  revenue: {
                    type: "number",
                    example: 750000
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Campaign created successfully"
          }
        }
      },

      get: {
        summary: "List campaigns",
        responses: {
          200: {
            description: "List of campaigns"
          }
        }
      }
    },

    "/api/v1/finance/reports/monthly": {
      get: {
        summary: "Get monthly financial report",
        parameters: [
          {
            name: "month",
            in: "query",
            required: true,
            schema: {
              type: "integer",
              example: 9
            }
          },
          {
            name: "year",
            in: "query",
            required: true,
            schema: {
              type: "integer",
              example: 2026
            }
          }
        ],
        responses: {
          200: {
            description: "Monthly financial report"
          }
        }
      }
    }
  }
};