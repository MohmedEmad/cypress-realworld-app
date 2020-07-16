// @ts-check
///<reference path="../global.d.ts" />

import { pick } from "lodash/fp";
import { format as formatDate } from "date-fns";

let COOKIE_MEMORY: any = {};
let LOCAL_STORAGE_MEMORY: any = {};
let LS_INCLUDE_KEYS: any = ["auth0AccessToken", "authState"];

const saveLocalStorageAuthCache = () => {
  LS_INCLUDE_KEYS.forEach((key: string) => {
    LOCAL_STORAGE_MEMORY[key] = localStorage[key];
  });
};

const restoreLocalStorageAuthCache = () => {
  LS_INCLUDE_KEYS.forEach((key: string) => {
    localStorage.setItem(key, LOCAL_STORAGE_MEMORY[key]);
  });
};

Cypress.Commands.add("saveLocalStorageAuthCache", () => {
  LS_INCLUDE_KEYS.forEach((key: string) => {
    LOCAL_STORAGE_MEMORY[key] = localStorage[key];
  });
});

Cypress.Commands.add("restoreLocalStorageAuthCache", () => {
  LS_INCLUDE_KEYS.forEach((key: string) => {
    localStorage.setItem(key, LOCAL_STORAGE_MEMORY[key]);
  });
});

Cypress.Commands.add("getBySel", (selector, ...args) => {
  return cy.get(`[data-test=${selector}]`, ...args);
});

Cypress.Commands.add("getBySelLike", (selector, ...args) => {
  return cy.get(`[data-test*=${selector}]`, ...args);
});

Cypress.Commands.add("login", (username, password, rememberUser = false) => {
  const signinPath = "/signin";
  const log = Cypress.log({
    name: "login",
    displayName: "LOGIN",
    message: [`🔐 Authenticating | ${username}`],
    // @ts-ignore
    autoEnd: false,
  });

  cy.server();
  cy.route("POST", "/login").as("loginUser");
  cy.route("GET", "checkAuth").as("getUserProfile");

  cy.location("pathname", { log: false }).then((currentPath) => {
    if (currentPath !== signinPath) {
      cy.visit(signinPath);
    }
  });

  log.snapshot("before");

  cy.getBySel("signin-username").type(username);
  cy.getBySel("signin-password").type(password);

  if (rememberUser) {
    cy.getBySel("signin-remember-me").find("input").check();
  }

  cy.getBySel("signin-submit").click();
  cy.wait("@loginUser").then((loginUser) => {
    log.set({
      consoleProps() {
        return {
          username,
          password,
          rememberUser,
          // @ts-ignore
          userId: loginUser.response.body.user.id,
        };
      },
    });

    log.snapshot("after");
    log.end();
  });
});

Cypress.Commands.add("loginByApi", (username, password = Cypress.env("defaultPassword")) => {
  return cy.request("POST", `${Cypress.env("apiUrl")}/login`, {
    username,
    password,
  });
});

Cypress.Commands.add("reactComponent", { prevSubject: "element" }, ($el) => {
  if ($el.length !== 1) {
    throw new Error(`cy.component() requires element of length 1 but got ${$el.length}`);
  }
  const key = Object.keys($el.get(0)).find((key) => key.startsWith("__reactInternalInstance$"));

  // @ts-ignore
  const domFiber = $el.prop(key);

  Cypress.log({
    name: "component",
    consoleProps() {
      return {
        component: domFiber,
      };
    },
  });

  return domFiber.return;
});

Cypress.Commands.add("setTransactionAmountRange", (min, max) => {
  cy.getBySel("transaction-list-filter-amount-range-button")
    .scrollIntoView()
    .click({ force: true });

  return cy
    .getBySelLike("filter-amount-range-slider")
    .reactComponent()
    .its("memoizedProps")
    .invoke("onChange", null, [min / 10, max / 10]);
});

Cypress.Commands.add("loginByXstate", (username, password = Cypress.env("defaultPassword")) => {
  const log = Cypress.log({
    name: "loginbyxstate",
    displayName: "LOGIN BY XSTATE",
    message: [`🔐 Authenticating | ${username}`],
    // @ts-ignore
    autoEnd: false,
  });

  cy.server();
  cy.route("POST", "/login").as("loginUser");
  cy.route("GET", "/checkAuth").as("getUserProfile");
  cy.visit("/signin", { log: false }).then(() => {
    log.snapshot("before");
  });

  cy.window({ log: false }).then((win) => win.authService.send("LOGIN", { username, password }));

  return cy.wait("@loginUser").then((loginUser) => {
    log.set({
      consoleProps() {
        return {
          username,
          password,
          // @ts-ignore
          userId: loginUser.response.body.user.id,
        };
      },
    });

    log.snapshot("after");
    log.end();
  });
});

Cypress.Commands.add("logoutByXstate", () => {
  cy.server();
  cy.route("POST", "/logout").as("logoutUser");

  const log = Cypress.log({
    name: "logoutByXstate",
    displayName: "LOGOUT BY XSTATE",
    message: [`🔒 Logging out current user`],
    // @ts-ignore
    autoEnd: false,
  });

  cy.window({ log: false }).then((win) => {
    log.snapshot("before");
    win.authService.send("LOGOUT");
  });

  return cy.wait("@logoutUser").then(() => {
    log.snapshot("after");
    log.end();
  });
});

Cypress.Commands.add("switchUser", (username) => {
  cy.logoutByXstate();
  return cy.loginByXstate(username);
});

Cypress.Commands.add("createTransaction", (payload) => {
  const log = Cypress.log({
    name: "createTransaction",
    displayName: "CREATE TRANSACTION",
    message: [`💸 (${payload.transactionType}): ${payload.sender.id} <> ${payload.receiver.id}`],
    // @ts-ignore
    autoEnd: false,
    consoleProps() {
      return payload;
    },
  });

  return cy
    .window({ log: false })
    .then((win) => {
      log.snapshot("before");
      win.createTransactionService.send("SET_USERS", payload);

      const createPayload = pick(["amount", "description", "transactionType"], payload);

      return win.createTransactionService.send("CREATE", {
        ...createPayload,
        senderId: payload.sender.id,
        receiverId: payload.receiver.id,
      });
    })
    .then(() => {
      log.snapshot("after");
      log.end();
    });
});

Cypress.Commands.add("nextTransactionFeedPage", (service, page) => {
  const log = Cypress.log({
    name: "nextTransactionFeedPage",
    displayName: "NEXT TRANSACTION FEED PAGE",
    message: [`📃 Fetching page ${page} with ${service}`],
    // @ts-ignore
    autoEnd: false,
    consoleProps() {
      return {
        service,
        page,
      };
    },
  });

  return cy
    .window({ log: false })
    .then((win) => {
      log.snapshot("before");
      // @ts-ignore
      return win[service].send("FETCH", { page });
    })
    .then(() => {
      log.snapshot("after");
      log.end();
    });
});

Cypress.Commands.add("pickDateRange", (startDate, endDate) => {
  const log = Cypress.log({
    name: "pickDateRange",
    displayName: "PICK DATE RANGE",
    message: [`🗓 ${startDate.toDateString()} to ${endDate.toDateString()}`],
    // @ts-ignore
    autoEnd: false,
    consoleProps() {
      return {
        startDate,
        endDate,
      };
    },
  });

  const selectDate = (date) => {
    return cy.get(`[data-date='${formatDate(date, "yyyy-MM-dd")}']`).click({ force: true });
  };

  // Focus initial viewable date picker range around target start date
  // @ts-ignore: Cypress expects wrapped variable to be a jQuery type
  cy.wrap(startDate.getTime()).then((now) => {
    log.snapshot("before");
    // @ts-ignore
    cy.clock(now, ["Date"]);
  });

  // Open date range picker
  cy.getBySelLike("filter-date-range-button").click({ force: true });
  cy.get(".Cal__Header__root").should("be.visible");

  // Select date range
  selectDate(startDate);
  selectDate(endDate).then(() => {
    log.snapshot("after");
    log.end();
  });

  cy.get(".Cal__Header__root").should("not.be.visible");
});

Cypress.Commands.add("database", (operation, entity, query, logTask = false) => {
  const params = {
    entity,
    query,
  };

  const log = Cypress.log({
    name: "database",
    displayName: "DATABASE",
    message: [`🔎 ${operation}ing within ${entity} data`],
    // @ts-ignore
    autoEnd: false,
    consoleProps() {
      return params;
    },
  });

  return cy.task(`${operation}:database`, params, { log: logTask }).then((data) => {
    log.snapshot();
    log.end();
    return data;
  });
});

Cypress.Commands.add("auth0AllowApp", () => {
  cy.get("body").then(($body) => {
    // If OAuth consent screen, allow
    if ($body.find("#allow").length > 0) {
      cy.get("#allow").click();
    }
  });
});

Cypress.Commands.add("auth0EnterUserCredentials", (username, password) => {
  cy.get("body").then(($body) => {
    if ($body.find(".auth0-lock-last-login-pane").length > 0) {
      // Use the saved credentials to re-authenticate
      cy.get('.auth0-lock-last-login-pane a[type="button"]').click();
    } else {
      // Fill in login form
      cy.get('[name="email"].auth0-lock-input').clear().type(username);
      cy.get('[name="password"].auth0-lock-input').clear().type(password, { log: false });
      cy.get(".auth0-lock-submit").click();
    }
  });
  cy.auth0AllowApp();
});

Cypress.Cookies.defaults({
  whitelist: "auth0.is.authenticated",
  //whitelist: new RegExp(/(auth0.*|did|a0.*)/g),
  //whitelist: new RegExp(/(auth0.is.authenticated|did|a0.*)/g),
});
Cypress.Commands.add("loginByAuth0", (username, password) => {
  // See https://github.com/cypress-io/cypress/issues/408 needed to clear all cookies from all domains
  // @ts-ignore
  // cy.clearCookies({ domain: null });

  // Preserve Auth0 Cookies
  // https://docs.cypress.io/faq/questions/using-cypress-faq.html#How-do-I-preserve-cookies-localStorage-in-between-my-tests
  // whitelist: ["auth0", "auth0.is.authenticated", "did", "did_compat"],
  // a0.spajs.txs

  cy.visit("/");
  /*cy.visit("/", {
    onBeforeLoad: (win) => {
      //cy.wait(500);
      //restoreLocalStorageAuthCache();
    },
  });*/

  // /(auth0.*|did.*|a0.*|OptanonConsent.*|_hjid.*|_hp2_id.*|_ga.*|ga_.*|_gid.*|ajs_.*|_gcl.*)/g

  //cy.get("#login").should("exist");
  //cy.get("#login").click();

  // @ts-ignore
  cy.getCookie("auth0.is.authenticated").then((cookie) => {
    if (cookie) {
      Cypress.log({ name: "auth0 cookies", message: "User is logged in" });
      console.log("Got cookie: ", cookie);
      COOKIE_MEMORY["auth0.is.authenticated"] = cookie;
      console.log("CM: ", COOKIE_MEMORY);
    } else {
      console.log(COOKIE_MEMORY["auth0.is.authenticated"]);
      if (COOKIE_MEMORY["auth0.is.authenticated"]) {
        console.log("Set cookie");
        cy.setCookie("auth0.is.authenticated", "true", ...COOKIE_MEMORY["auth0.is.authenticated"]);
      }

      //Cypress.log({ name: "in else", message: "User is NOT logged in" });
      cy.get("body").then(($body) => {
        if ($body.find(".auth0-lock-name").length > 0) {
          cy.contains("auth0-cypress-demo").should("be.visible");
        }
      });

      cy.location()
        .should(
          "satisfy",
          (location: any) =>
            //(location.host === "localhost:3000" && location.pathname === "/") ||
            location.host === Cypress.env("auth0_domain") && location.pathname === "/login"
        )
        .then((location) => {
          if (location.pathname === "/login") {
            console.log("perform login", location.pathname);
            cy.auth0AllowApp();
            cy.auth0EnterUserCredentials(username, password);
            cy.saveLocalStorageAuthCache();
          }
        });
    }
  });
});
