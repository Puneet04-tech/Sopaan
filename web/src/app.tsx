import { useEffect } from "preact/hooks";
import { Layout } from "./components/Layout";
import { Icon } from "./components/ui";
import { Home } from "./features/Home";
import { Profile } from "./features/Profile";
import { Discover } from "./features/Discover";
import { CareerDetail } from "./features/CareerDetail";
import { Plan } from "./features/Plan";
import { Act } from "./features/Act";
import { ActDetail } from "./features/ActDetail";
import { Prove } from "./features/Prove";
import { Verify } from "./features/Verify";
import { Credits } from "./features/Credits";
import { SyncPage } from "./features/Sync";
import { Hub } from "./features/Hub";
import { Reviewer } from "./features/Reviewer";
import { Sponsor } from "./features/Sponsor";
import { Settings } from "./features/Settings";
import { More } from "./features/More";
import { Tour } from "./features/Tour";
import { Landing } from "./features/Landing";
import { Login } from "./features/Login";
import { Register } from "./features/Register";
import { bootError, ready, route } from "./state";
import { getAuthToken } from "./data/auth";

export function App() {
  useEffect(() => {
    const apply = () => {
      route.value = window.location.hash.replace(/^#/, "") || "/";
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  if (!ready.value) {
    return (
      <div class="app">
        <div class="screen" style="padding-top:80px">
          <div class="center">
            <div class="boot-mark">
              <Icon name="lock" size={26} />
            </div>
            <h1>SOPAAN</h1>
            <p class="muted mt-2">हर कदम, प्रमाणित</p>
          </div>
          <div class="stack mt-4">
            <div class="skeleton" />
            <div class="skeleton" />
            <div class="skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (bootError.value) {
    return (
      <div class="app">
        <div class="screen" style="padding-top:60px">
          <div class="card">
            <h2>Could not start</h2>
            <p class="muted mt-2">The local store or a signed pack failed verification.</p>
            <pre class="code mt-2">{bootError.value}</pre>
            <button class="btn mt-3" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }

  const segments = route.value.split("?")[0].split("/").filter(Boolean);
  const head = segments[0] ?? "";
  const param = segments[1];

  const hasToken = !!getAuthToken();
  // Show landing for unauthenticated users on root/welcome, otherwise go to app
  if (head === "welcome" || (head === "" && !hasToken)) return <Landing />;
  if (head === "" && hasToken) {
    route.value = "/discover";
    window.location.hash = "#/discover";
    return <Layout><Discover /></Layout>;
  }

  let screen = <Home />;
  switch (head) {
    case "login":
      return (
        <div class="app">
          <Login />
        </div>
      );
    case "register":
      return (
        <div class="app">
          <Register />
        </div>
      );
    case "":
      screen = <Home />;
      break;
    case "profile":
      screen = <Profile />;
      break;
    case "discover":
      screen = <Discover />;
      break;
    case "career":
      screen = <CareerDetail careerId={param ?? ""} />;
      break;
    case "plan":
      screen = <Plan />;
      break;
    case "act":
      screen = param ? <ActDetail schemeId={param} /> : <Act />;
      break;
    case "prove":
      screen = <Prove />;
      break;
    case "verify":
      screen = <Verify />;
      break;
    case "credits":
      screen = <Credits />;
      break;
    case "sync":
      screen = <SyncPage />;
      break;
    case "hub":
      screen = <Hub />;
      break;
    case "review":
      screen = <Reviewer />;
      break;
    case "sponsor":
      screen = <Sponsor />;
      break;
    case "settings":
      screen = <Settings />;
      break;
    case "tour":
      screen = <Tour />;
      break;
    case "more":
      screen = <More />;
      break;
    default:
      screen = (
        <div class="screen">
          <div class="card center">
            <h2>404</h2>
            <p class="muted mt-2">That screen is not part of Sopaan.</p>
            <a class="btn mt-3" href="#/">Go home</a>
          </div>
        </div>
      );
  }

  return (
    <div class="app">
      <Layout>{screen}</Layout>
    </div>
  );
}
