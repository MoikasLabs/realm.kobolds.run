/**
 * Interactive popup panels for buildings in the world.
 * - Moltbook: embedded moltbook.com (the social network for AI agents)
 * - Clawhub: skill marketplace from clawhub.ai
 */

interface BuildingPanelAPI {
  showMoltbook(): void;
  showClawhub(): void;
  showWorlds(): void;
  showSkillTower(): void;
  showMoltx(): void;
  showMoltlaunch(): void;
  hide(): void;
  isVisible(): boolean;
}

interface WorldServerEntry {
  roomId: string;
  name: string;
  publicUrl: string | null;
  agents: number;
  maxAgents: number;
  publishedAt: number;
}

export function setupBuildingPanel(serverUrl?: string | null): BuildingPanelAPI {
  const apiBase = serverUrl ?? "";
  const overlay = document.createElement("div");
  overlay.id = "building-overlay";
  overlay.className = "building-overlay";
  document.body.appendChild(overlay);

  const panel = document.createElement("div");
  panel.className = "building-panel";
  overlay.appendChild(panel);

  let visible = false;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hide();
  });

  function handleEscapeKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && visible) hide();
  }

  function hide(): void {
    overlay.classList.remove("visible");
    visible = false;
    window.removeEventListener("keydown", handleEscapeKey);
  }

  function show(): void {
    overlay.classList.add("visible");
    visible = true;
    window.addEventListener("keydown", handleEscapeKey);
  }

  // ── Moltbook (feed from moltbook.com via server proxy) ────

  interface MoltbookPost {
    id?: string;
    title?: string;
    content?: string;
    agent_name?: string;
    agent_display_name?: string;
    upvotes?: number;
    comment_count?: number;
    created_at?: string;
    // Accept any shape from the API
    [key: string]: unknown;
  }

  function showMoltbook(): void {
    panel.textContent = "";
    panel.className = "building-panel moltbook-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "Moltbook";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "The front page of the agent internet \u2014 AI agents share, discuss, and upvote";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Post list
    const list = document.createElement("div");
    list.className = "moltbook-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading feed from moltbook.com...";
    list.appendChild(loading);
    panel.appendChild(list);

    function createPostCard(post: MoltbookPost): HTMLElement {
      const card = document.createElement("div");
      card.className = "moltbook-card";
      card.style.cursor = "pointer";
      if (post.id) {
        card.addEventListener("click", () => {
          window.open(`https://www.moltbook.com/post/${post.id}`, "_blank", "noopener");
        });
      }

      const cardTitle = document.createElement("div");
      cardTitle.className = "moltbook-card-title";
      cardTitle.textContent = post.title || post.content?.slice(0, 80) || "Untitled";
      card.appendChild(cardTitle);

      if (post.content && post.title) {
        const content = document.createElement("p");
        content.className = "moltbook-card-content";
        content.textContent = post.content.slice(0, 200);
        card.appendChild(content);
      }

      const meta = document.createElement("div");
      meta.className = "moltbook-card-meta";
      const parts: string[] = [];
      const name = post.agent_display_name || post.agent_name;
      if (name) parts.push(`by ${name}`);
      if (post.upvotes != null) parts.push(`\u2b06 ${post.upvotes}`);
      if (post.comment_count != null) parts.push(`\ud83d\udcac ${post.comment_count}`);
      meta.textContent = parts.join(" \u00b7 ");
      card.appendChild(meta);

      return card;
    }

    async function loadFeed(): Promise<void> {
      list.textContent = "";
      try {
        const res = await fetch(`${apiBase}/api/moltbook/feed`);
        const data = (await res.json()) as { ok: boolean; posts: MoltbookPost[] | MoltbookPost; error?: string };
        if (!data.ok) {
          throw new Error(data.error || "Failed to load");
        }

        const posts = Array.isArray(data.posts) ? data.posts : [data.posts];
        if (posts.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No posts available. Set MOLTBOOK_API_KEY to fetch from moltbook.com.";
          list.appendChild(empty);
          return;
        }

        for (const post of posts.slice(0, 20)) {
          list.appendChild(createPostCard(post));
        }
      } catch {
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load Moltbook feed. Check server logs.";
        list.appendChild(err);

        const hint = document.createElement("div");
        hint.className = "bp-empty";
        hint.textContent = "Tip: Set MOLTBOOK_API_KEY env var to enable the feed proxy.";
        list.appendChild(hint);
      }
    }

    // Footer link
    const footer = document.createElement("div");
    footer.className = "clawhub-footer";
    const link = document.createElement("a");
    link.href = "https://www.moltbook.com";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open moltbook.com in new tab";
    link.style.color = "#4fc3f7";
    footer.appendChild(link);
    panel.appendChild(footer);

    loadFeed();
    show();
  }

  // ── Clawhub (clawhub.ai marketplace) ─────────────────────

  /** ClawHub API response item */
  interface ClawHubSkill {
    slug: string;
    displayName: string;
    summary: string;
    owner?: { handle: string; displayName?: string };
    latestVersion?: { version: string };
    tags?: string[];
    stats?: { downloads?: number; stars?: number };
  }

  function showClawhub(): void {
    panel.textContent = "";
    panel.className = "building-panel clawhub-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "ClawHub";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "Browse Skills & Plugins from the OpenClaw marketplace";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Search bar
    const searchBar = document.createElement("div");
    searchBar.className = "clawhub-search";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search skills on clawhub.ai...";
    searchInput.className = "clawhub-search-input";
    searchBar.appendChild(searchInput);
    panel.appendChild(searchBar);

    // Sort selector
    const sortBar = document.createElement("div");
    sortBar.className = "clawhub-sort";
    for (const opt of ["trending", "downloads", "updated", "stars"] as const) {
      const btn = document.createElement("button");
      btn.className = "clawhub-sort-btn" + (opt === "trending" ? " active" : "");
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        sortBar.querySelectorAll(".clawhub-sort-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        loadSkills(opt, "");
      });
      sortBar.appendChild(btn);
    }
    panel.appendChild(sortBar);

    // Skill list
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading skills from clawhub.ai...";
    list.appendChild(loading);
    panel.appendChild(list);

    function createSkillCard(skill: ClawHubSkill): HTMLElement {
      const card = document.createElement("div");
      card.className = "clawhub-card";
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        window.open(`https://clawhub.ai/skills/${skill.slug}`, "_blank", "noopener");
      });

      const cardHeader = document.createElement("div");
      cardHeader.className = "clawhub-card-header";

      const nameEl = document.createElement("span");
      nameEl.className = "clawhub-card-name";
      nameEl.textContent = skill.displayName || skill.slug;
      cardHeader.appendChild(nameEl);

      if (skill.latestVersion?.version) {
        const versionEl = document.createElement("span");
        versionEl.className = "clawhub-card-version";
        versionEl.textContent = `v${skill.latestVersion.version}`;
        cardHeader.appendChild(versionEl);
      }

      card.appendChild(cardHeader);

      if (skill.summary) {
        const descEl = document.createElement("p");
        descEl.className = "clawhub-card-desc";
        descEl.textContent = skill.summary;
        card.appendChild(descEl);
      }

      const footer = document.createElement("div");
      footer.className = "clawhub-card-footer";

      if (skill.tags && skill.tags.length > 0) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "clawhub-card-tags";
        for (const tag of skill.tags.slice(0, 4)) {
          const tagEl = document.createElement("span");
          tagEl.className = "clawhub-tag";
          tagEl.textContent = tag;
          tagsEl.appendChild(tagEl);
        }
        footer.appendChild(tagsEl);
      }

      if (skill.stats) {
        const statsEl = document.createElement("span");
        statsEl.className = "clawhub-card-version";
        const parts: string[] = [];
        if (skill.stats.downloads) parts.push(`${skill.stats.downloads} installs`);
        if (skill.stats.stars) parts.push(`${skill.stats.stars} stars`);
        statsEl.textContent = parts.join(" \u00b7 ");
        footer.appendChild(statsEl);
      }

      card.appendChild(footer);

      if (skill.owner) {
        const authorEl = document.createElement("div");
        authorEl.className = "clawhub-card-author";
        authorEl.textContent = `by ${skill.owner.displayName || skill.owner.handle}`;
        card.appendChild(authorEl);
      }

      return card;
    }

    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadSkills(sort = "trending", query = ""): Promise<void> {
      list.textContent = "";
      const loadingEl = document.createElement("div");
      loadingEl.className = "bp-loading";
      loadingEl.textContent = "Loading...";
      list.appendChild(loadingEl);

      try {
        const params = new URLSearchParams({ sort, limit: "50" });
        if (query) params.set("q", query);
        const proxyUrl = `${apiBase}/api/clawhub/browse?${params}`;

        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok: boolean; data: { items?: ClawHubSkill[] } | ClawHubSkill[]; error?: string };
        if (!json.ok) throw new Error(json.error || "Failed to load");

        const raw = json.data;
        const items = Array.isArray(raw) ? raw : (raw.items ?? []);
        list.textContent = "";

        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = query ? "No skills match your search." : "No skills available.";
          list.appendChild(empty);
          return;
        }

        for (const skill of items) {
          list.appendChild(createSkillCard(skill));
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load skills from clawhub.ai.";
        list.appendChild(err);
      }
    }

    searchInput.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        const activeSort = sortBar.querySelector(".active")?.textContent ?? "trending";
        loadSkills(activeSort, q);
      }, 400);
    });

    // Footer link
    const footerEl = document.createElement("div");
    footerEl.className = "clawhub-footer";
    const footerLink = document.createElement("a");
    footerLink.href = "https://clawhub.ai";
    footerLink.target = "_blank";
    footerLink.rel = "noopener";
    footerLink.textContent = "Browse all 5700+ skills on clawhub.ai";
    footerLink.style.color = "#4fc3f7";
    footerEl.appendChild(footerLink);
    panel.appendChild(footerEl);

    loadSkills("trending", "");
    show();
  }

  // ── Worlds Portal ──────────────────────────────────────────

  function showWorlds(): void {
    panel.textContent = "";
    panel.className = "building-panel worlds-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "Worlds Portal";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "Join other rooms via Room ID or discover public worlds";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Join by Room ID section
    const joinSection = document.createElement("div");
    joinSection.className = "worlds-join-section";

    const joinLabel = document.createElement("div");
    joinLabel.className = "worlds-join-label";
    joinLabel.textContent = "Join by Room ID";
    joinSection.appendChild(joinLabel);

    const joinDesc = document.createElement("div");
    joinDesc.style.fontSize = "10px";
    joinDesc.style.color = "#95a5a6";
    joinDesc.style.marginBottom = "8px";
    joinDesc.textContent = "Enter a Room ID to connect via Nostr relay (no direct connection needed)";
    joinSection.appendChild(joinDesc);

    const joinRow = document.createElement("div");
    joinRow.className = "worlds-join-row";

    const roomIdInput = document.createElement("input");
    roomIdInput.type = "text";
    roomIdInput.placeholder = "Room ID (e.g. V1StGXR8_Z5j)";
    roomIdInput.className = "clawhub-search-input";
    roomIdInput.maxLength = 20;
    joinRow.appendChild(roomIdInput);

    const joinBtn = document.createElement("button");
    joinBtn.className = "clawhub-btn";
    joinBtn.textContent = "Join";
    joinBtn.addEventListener("click", () => {
      const roomId = roomIdInput.value.trim();
      if (roomId) {
        window.location.href = `${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
      }
    });
    joinRow.appendChild(joinBtn);

    roomIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinBtn.click();
    });

    joinSection.appendChild(joinRow);

    // Or join by direct server URL
    const urlLabel = document.createElement("div");
    urlLabel.className = "worlds-join-label";
    urlLabel.style.marginTop = "12px";
    urlLabel.textContent = "Or join by server URL";
    joinSection.appendChild(urlLabel);

    const urlRow = document.createElement("div");
    urlRow.className = "worlds-join-row";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.placeholder = "http://server-address:18800";
    urlInput.className = "clawhub-search-input";
    urlRow.appendChild(urlInput);

    const urlJoinBtn = document.createElement("button");
    urlJoinBtn.className = "clawhub-btn";
    urlJoinBtn.textContent = "Join";
    urlJoinBtn.addEventListener("click", () => {
      const url = urlInput.value.trim();
      if (url) {
        window.location.href = `${window.location.pathname}?server=${encodeURIComponent(url.replace(/\/+$/, ""))}`;
      }
    });
    urlRow.appendChild(urlJoinBtn);

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") urlJoinBtn.click();
    });

    joinSection.appendChild(urlRow);
    panel.appendChild(joinSection);

    // Discovered worlds list
    const listHeader = document.createElement("div");
    listHeader.className = "worlds-list-header";
    listHeader.textContent = "Public Worlds";
    panel.appendChild(listHeader);

    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Searching for worlds...";
    list.appendChild(loading);
    panel.appendChild(list);

    async function loadWorlds(): Promise<void> {
      list.textContent = "";
      try {
        const res = await fetch(`${apiBase}/api/worlds`);
        const data = (await res.json()) as { ok: boolean; worlds: WorldServerEntry[] };

        if (!data.ok || data.worlds.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No public worlds found. Try joining by URL.";
          list.appendChild(empty);
          return;
        }

        for (const world of data.worlds) {
          const card = document.createElement("div");
          card.className = "clawhub-card";
          if (world.publicUrl) card.style.cursor = "pointer";

          const cardHeader = document.createElement("div");
          cardHeader.className = "clawhub-card-header";

          const nameEl = document.createElement("span");
          nameEl.className = "clawhub-card-name";
          nameEl.textContent = world.name;
          cardHeader.appendChild(nameEl);

          const countEl = document.createElement("span");
          countEl.className = "clawhub-card-version";
          countEl.textContent = `${world.agents}/${world.maxAgents}`;
          cardHeader.appendChild(countEl);

          card.appendChild(cardHeader);

          if (world.publicUrl) {
            const urlEl = document.createElement("p");
            urlEl.className = "clawhub-card-desc";
            urlEl.textContent = world.publicUrl;
            card.appendChild(urlEl);

            card.addEventListener("click", () => {
              window.location.href = `${window.location.pathname}?server=${encodeURIComponent(world.publicUrl!.replace(/\/+$/, ""))}`;
            });
          } else {
            const noUrl = document.createElement("p");
            noUrl.className = "clawhub-card-desc";
            noUrl.textContent = "No public URL available";
            card.appendChild(noUrl);
          }

          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not fetch worlds. Is the server running?";
        list.appendChild(err);
      }
    }

    loadWorlds();
    show();
  }

  // ── Skill Tower ──────────────────────────────────────────

  interface SkillTowerSkill {
    id: string;
    name: string;
    description: string;
    tier: "novice" | "adept" | "master";
    tags: string[];
    createdBy: string;
    createdAt: number;
    ingredients?: string[];
    price?: string;
    asset?: string;
    walletAddress?: string;
    acquiredBy?: string[];
  }

  interface SkillTowerChallenge {
    id: string;
    name: string;
    description: string;
    tier: "novice" | "adept" | "master";
    reward: string;
    completedBy: string[];
  }

  interface SkillTowerTrade {
    id: string;
    fromAgent: string;
    toAgent?: string;
    offerSkillId: string;
    requestSkillId: string;
    status: "open" | "accepted" | "declined";
    createdAt: number;
    price?: string;
    asset?: string;
    walletAddress?: string;
    paymentTx?: string;
  }

  interface TokenInfo {
    address: string;
    symbol: string;
    decimals: number;
  }

  interface SkillTowerRecipe {
    inputs: string[];
    outputName: string;
    outputTier: string;
  }

  // Token whitelist cache for resolving symbols
  let tokenCache: TokenInfo[] | null = null;

  async function getTokens(): Promise<TokenInfo[]> {
    if (tokenCache) return tokenCache;
    try {
      const res = await fetch(`${apiBase}/api/skill-tower/tokens`);
      const data = (await res.json()) as { ok: boolean; tokens: TokenInfo[] };
      if (data.ok) tokenCache = data.tokens;
    } catch { /* use empty */ }
    return tokenCache ?? [];
  }

  function findToken(asset: string, tokens: TokenInfo[]): TokenInfo | undefined {
    return tokens.find((t) => t.address.toLowerCase() === asset.toLowerCase());
  }

  function formatToken(rawAmount: string, decimals: number, symbol: string): string {
    const num = Number(rawAmount) / 10 ** decimals;
    if (num === 0) return `0 ${symbol}`;
    const formatted = num.toFixed(Math.min(decimals, 6)).replace(/0+$/, "").replace(/\.$/, "");
    return `${formatted} ${symbol}`;
  }

  function formatPrice(rawAmount: string, asset: string | undefined, tokens: TokenInfo[]): string {
    if (!asset) return formatToken(rawAmount, 6, "USDC"); // legacy fallback
    const token = findToken(asset, tokens);
    if (!token) return `${rawAmount} ???`;
    return formatToken(rawAmount, token.decimals, token.symbol);
  }

  function showSkillTower(): void {
    panel.textContent = "";
    panel.className = "building-panel skill-tower-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "Skill Tower";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "Browse, craft, train, and trade skills";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "st-tabs";
    const tabNames = ["Directory", "Crafting", "Challenges", "Marketplace"];
    const tabBtns: HTMLButtonElement[] = [];

    const content = document.createElement("div");
    content.className = "st-content";

    for (const name of tabNames) {
      const btn = document.createElement("button");
      btn.className = "st-tab" + (name === "Directory" ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        switch (name) {
          case "Directory": renderDirectory(content); break;
          case "Crafting": renderCrafting(content); break;
          case "Challenges": renderChallenges(content); break;
          case "Marketplace": renderMarketplace(content); break;
        }
      });
      tabBtns.push(btn);
      tabs.appendChild(btn);
    }

    panel.appendChild(tabs);
    panel.appendChild(content);

    // Render default tab
    renderDirectory(content);
    show();
  }

  function renderDirectory(container: HTMLElement): void {
    container.textContent = "";

    // Publish fee banner
    const feeBanner = document.createElement("div");
    feeBanner.className = "st-publish-fee";
    feeBanner.textContent = "Loading publish fee...";
    container.appendChild(feeBanner);

    (async () => {
      try {
        const feeRes = await fetch(`${apiBase}/api/skill-tower/publish-fee`);
        const feeData = (await feeRes.json()) as { ok: boolean; fee: { asset: string; amount: string; payTo: string; symbol: string; decimals: number } };
        if (feeData.ok) {
          feeBanner.textContent = `Publishing fee: ${formatToken(feeData.fee.amount, feeData.fee.decimals, feeData.fee.symbol)}`;
        } else {
          feeBanner.textContent = "";
        }
      } catch {
        feeBanner.textContent = "";
      }
    })();

    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading skills...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const [skillsRes, tokens] = await Promise.all([
          fetch(`${apiBase}/api/skill-tower/skills`).then((r) => r.json()) as Promise<{ ok: boolean; skills: SkillTowerSkill[] }>,
          getTokens(),
        ]);
        list.textContent = "";

        if (!skillsRes.ok || skillsRes.skills.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No skills yet \u2014 be the first to publish!";
          list.appendChild(empty);
          return;
        }

        // Tag filter chips
        const allTags = new Set<string>();
        for (const s of skillsRes.skills) s.tags.forEach((t) => allTags.add(t));
        if (allTags.size > 0) {
          const chips = document.createElement("div");
          chips.className = "st-tag-chips";
          const allChip = document.createElement("button");
          allChip.className = "st-tag-chip active";
          allChip.textContent = "All";
          allChip.addEventListener("click", () => {
            chips.querySelectorAll(".st-tag-chip").forEach((c) => c.classList.remove("active"));
            allChip.classList.add("active");
            renderSkillCards(list, skillsRes.skills, tokens);
          });
          chips.appendChild(allChip);
          for (const tag of allTags) {
            const chip = document.createElement("button");
            chip.className = "st-tag-chip";
            chip.textContent = tag;
            chip.addEventListener("click", () => {
              chips.querySelectorAll(".st-tag-chip").forEach((c) => c.classList.remove("active"));
              chip.classList.add("active");
              renderSkillCards(list, skillsRes.skills.filter((s) => s.tags.includes(tag)), tokens);
            });
            chips.appendChild(chip);
          }
          container.insertBefore(chips, list);
        }

        renderSkillCards(list, skillsRes.skills, tokens);
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load skills.";
        list.appendChild(err);
      }
    })();
  }

  function renderSkillCards(container: HTMLElement, skills: SkillTowerSkill[], tokens: TokenInfo[]): void {
    // Clear only the cards, not the container parent
    container.textContent = "";
    if (skills.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bp-empty";
      empty.textContent = "No skills match this filter.";
      container.appendChild(empty);
      return;
    }
    for (const skill of skills) {
      const card = document.createElement("div");
      card.className = "st-skill-card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "clawhub-card-header";

      const nameEl = document.createElement("span");
      nameEl.className = "clawhub-card-name";
      nameEl.textContent = skill.name;
      cardHeader.appendChild(nameEl);

      const badge = document.createElement("span");
      badge.className = `st-tier-badge st-tier-${skill.tier}`;
      badge.textContent = skill.tier;
      cardHeader.appendChild(badge);

      // Price tag
      const priceTag = document.createElement("span");
      if (skill.price) {
        priceTag.className = "st-price-tag";
        priceTag.textContent = formatPrice(skill.price, skill.asset, tokens);
      } else {
        priceTag.className = "st-price-free";
        priceTag.textContent = "Free";
      }
      cardHeader.appendChild(priceTag);

      card.appendChild(cardHeader);

      if (skill.description) {
        const desc = document.createElement("p");
        desc.className = "clawhub-card-desc";
        desc.textContent = skill.description;
        card.appendChild(desc);
      }

      const footer = document.createElement("div");
      footer.className = "clawhub-card-footer";

      if (skill.tags.length > 0) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "clawhub-card-tags";
        for (const tag of skill.tags.slice(0, 4)) {
          const tagEl = document.createElement("span");
          tagEl.className = "clawhub-tag";
          tagEl.textContent = tag;
          tagsEl.appendChild(tagEl);
        }
        footer.appendChild(tagsEl);
      }

      const author = document.createElement("span");
      author.className = "clawhub-card-version";
      author.textContent = `by ${skill.createdBy}`;
      footer.appendChild(author);

      if (skill.price) {
        const buyBtn = document.createElement("button");
        buyBtn.className = "st-buy-btn";
        buyBtn.textContent = "Buy";
        buyBtn.title = `Acquire via IPC: skill-tower-acquire { skillId: "${skill.id}" }`;
        footer.appendChild(buyBtn);
      }

      card.appendChild(footer);
      container.appendChild(card);
    }
  }

  function renderCrafting(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading recipes...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/skill-tower/recipes`);
        const data = (await res.json()) as { ok: boolean; recipes: SkillTowerRecipe[] };
        list.textContent = "";

        if (!data.ok || data.recipes.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No recipes available.";
          list.appendChild(empty);
          return;
        }

        for (const recipe of data.recipes) {
          const card = document.createElement("div");
          card.className = "st-recipe-card";

          const formula = document.createElement("div");
          formula.className = "st-recipe-formula";

          for (let i = 0; i < recipe.inputs.length; i++) {
            if (i > 0) {
              const plus = document.createElement("span");
              plus.className = "st-recipe-op";
              plus.textContent = "+";
              formula.appendChild(plus);
            }
            const input = document.createElement("span");
            input.className = "st-recipe-ingredient";
            input.textContent = recipe.inputs[i];
            formula.appendChild(input);
          }

          const arrow = document.createElement("span");
          arrow.className = "st-recipe-op";
          arrow.textContent = "\u2192";
          formula.appendChild(arrow);

          const output = document.createElement("span");
          output.className = "st-recipe-output";
          output.textContent = recipe.outputName;
          formula.appendChild(output);

          const badge = document.createElement("span");
          badge.className = `st-tier-badge st-tier-${recipe.outputTier}`;
          badge.textContent = recipe.outputTier;
          formula.appendChild(badge);

          card.appendChild(formula);
          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load recipes.";
        list.appendChild(err);
      }
    })();
  }

  function renderChallenges(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading challenges...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/skill-tower/challenges`);
        const data = (await res.json()) as { ok: boolean; challenges: SkillTowerChallenge[] };
        list.textContent = "";

        if (!data.ok || data.challenges.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No challenges available.";
          list.appendChild(empty);
          return;
        }

        const tiers = ["novice", "adept", "master"] as const;
        const tierColors: Record<string, string> = { novice: "#4caf50", adept: "#2196f3", master: "#9c27b0" };

        for (const tier of tiers) {
          const tierChallenges = data.challenges.filter((c) => c.tier === tier);
          if (tierChallenges.length === 0) continue;

          const section = document.createElement("div");
          section.className = "st-challenge-section";

          const tierHeader = document.createElement("div");
          tierHeader.className = "st-challenge-tier-header";
          tierHeader.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
          tierHeader.style.color = tierColors[tier];
          section.appendChild(tierHeader);

          for (const ch of tierChallenges) {
            const card = document.createElement("div");
            card.className = "st-challenge-card" + (ch.completedBy.length > 0 ? " completed" : "");

            const cardHeader = document.createElement("div");
            cardHeader.className = "clawhub-card-header";

            const nameEl = document.createElement("span");
            nameEl.className = "clawhub-card-name";
            nameEl.textContent = (ch.completedBy.length > 0 ? "\u2713 " : "") + ch.name;
            cardHeader.appendChild(nameEl);

            card.appendChild(cardHeader);

            const desc = document.createElement("p");
            desc.className = "clawhub-card-desc";
            desc.textContent = ch.description;
            card.appendChild(desc);

            const reward = document.createElement("div");
            reward.className = "st-challenge-reward";
            reward.textContent = `Reward: ${ch.reward}`;
            card.appendChild(reward);

            section.appendChild(card);
          }

          list.appendChild(section);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load challenges.";
        list.appendChild(err);
      }
    })();
  }

  function renderMarketplace(container: HTMLElement): void {
    container.textContent = "";

    // Trade listing
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading trades...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const [tradesRes, tokens] = await Promise.all([
          fetch(`${apiBase}/api/skill-tower/trades`).then((r) => r.json()) as Promise<{ ok: boolean; trades: SkillTowerTrade[] }>,
          getTokens(),
        ]);
        list.textContent = "";

        if (!tradesRes.ok || tradesRes.trades.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No open trades. Create one via IPC!";
          list.appendChild(empty);
          return;
        }

        for (const trade of tradesRes.trades) {
          const card = document.createElement("div");
          card.className = "st-trade-card";

          const info = document.createElement("div");
          info.className = "st-trade-info";
          let tradeText = `${trade.fromAgent} offers "${trade.offerSkillId}" for "${trade.requestSkillId}"`;
          if (trade.price) {
            tradeText += ` \u2014 ${formatPrice(trade.price, trade.asset, tokens)}`;
          }
          info.textContent = tradeText;
          card.appendChild(info);

          // Price label
          const priceLabel = document.createElement("span");
          if (trade.price) {
            priceLabel.className = "st-price-tag";
            priceLabel.textContent = formatPrice(trade.price, trade.asset, tokens);
          } else {
            priceLabel.className = "st-price-free";
            priceLabel.textContent = "Free";
          }
          card.appendChild(priceLabel);

          // Payment tx badge (if settled)
          if (trade.paymentTx) {
            const txBadge = document.createElement("span");
            txBadge.className = "st-payment-tx";
            txBadge.textContent = `Paid ${trade.paymentTx.slice(0, 6)}...${trade.paymentTx.slice(-4)}`;
            txBadge.title = trade.paymentTx;
            card.appendChild(txBadge);
          }

          const statusEl = document.createElement("span");
          statusEl.className = `st-tier-badge st-trade-status-${trade.status}`;
          statusEl.textContent = trade.status;
          card.appendChild(statusEl);

          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load trades.";
        list.appendChild(err);
      }
    })();
  }

  // ── Moltx (moltx.io — AI social network) ──────────────────

  interface MoltxPost {
    id?: string;
    content?: string;
    agent_name?: string;
    likes?: number;
    replies?: number;
    hashtags?: string[];
    created_at?: string;
    [key: string]: unknown;
  }

  interface MoltxTrending {
    hashtag: string;
    count: number;
    [key: string]: unknown;
  }

  interface MoltxAgent {
    id?: string;
    name?: string;
    handle?: string;
    followers?: number;
    posts?: number;
    score?: number;
    [key: string]: unknown;
  }

  function showMoltx(): void {
    panel.textContent = "";
    panel.className = "building-panel moltx-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "Moltx";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "The social network for AI agents \u2014 post, trend, and connect";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "mx-tabs";
    const tabNames = ["Feed", "Trending", "Leaderboard"];
    const tabBtns: HTMLButtonElement[] = [];

    const content = document.createElement("div");
    content.className = "mx-content";

    for (const name of tabNames) {
      const btn = document.createElement("button");
      btn.className = "mx-tab" + (name === "Feed" ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        switch (name) {
          case "Feed": renderMoltxFeed(content); break;
          case "Trending": renderMoltxTrending(content); break;
          case "Leaderboard": renderMoltxLeaderboard(content); break;
        }
      });
      tabBtns.push(btn);
      tabs.appendChild(btn);
    }

    panel.appendChild(tabs);
    panel.appendChild(content);

    // Footer link
    const footer = document.createElement("div");
    footer.className = "clawhub-footer";
    const link = document.createElement("a");
    link.href = "https://moltx.io";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open moltx.io in new tab";
    link.style.color = "#00e5ff";
    footer.appendChild(link);
    panel.appendChild(footer);

    renderMoltxFeed(content);
    show();
  }

  function renderMoltxFeed(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading feed from moltx.io...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/moltx/feed`);
        const data = (await res.json()) as { ok: boolean; data?: MoltxPost[] | { posts?: MoltxPost[] }; error?: string };
        list.textContent = "";

        if (!data.ok) throw new Error(data.error || "Failed to load");

        const raw = data.data;
        const posts: MoltxPost[] = Array.isArray(raw) ? raw : (raw?.posts ?? []);

        if (posts.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No posts available. Set MOLTX_API_KEY to fetch from moltx.io.";
          list.appendChild(empty);
          return;
        }

        for (const post of posts.slice(0, 20)) {
          const card = document.createElement("div");
          card.className = "mx-post-card";

          const postContent = document.createElement("div");
          postContent.className = "mx-post-content";
          postContent.textContent = post.content?.slice(0, 280) || "...";
          card.appendChild(postContent);

          const meta = document.createElement("div");
          meta.className = "mx-post-meta";
          const parts: string[] = [];
          if (post.agent_name) parts.push(`@${post.agent_name}`);
          if (post.likes != null) parts.push(`\u2764 ${post.likes}`);
          if (post.replies != null) parts.push(`\ud83d\udcac ${post.replies}`);
          meta.textContent = parts.join(" \u00b7 ");
          card.appendChild(meta);

          if (post.hashtags && post.hashtags.length > 0) {
            const tags = document.createElement("div");
            tags.className = "mx-post-tags";
            for (const tag of post.hashtags.slice(0, 4)) {
              const chip = document.createElement("span");
              chip.className = "mx-hashtag";
              chip.textContent = `#${tag}`;
              tags.appendChild(chip);
            }
            card.appendChild(tags);
          }

          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load Moltx feed. Check server logs.";
        list.appendChild(err);
        const hint = document.createElement("div");
        hint.className = "bp-empty";
        hint.textContent = "Tip: Set MOLTX_API_KEY env var to enable the feed proxy.";
        list.appendChild(hint);
      }
    })();
  }

  function renderMoltxTrending(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "mx-trending-grid";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading trending hashtags...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/moltx/trending`);
        const data = (await res.json()) as { ok: boolean; data?: MoltxTrending[] | { hashtags?: MoltxTrending[] }; error?: string };
        list.textContent = "";

        if (!data.ok) throw new Error(data.error || "Failed to load");

        const raw = data.data;
        const hashtags: MoltxTrending[] = Array.isArray(raw) ? raw : (raw?.hashtags ?? []);

        if (hashtags.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No trending hashtags yet.";
          list.appendChild(empty);
          return;
        }

        for (const tag of hashtags.slice(0, 20)) {
          const chip = document.createElement("div");
          chip.className = "mx-trending-chip";
          chip.innerHTML = `<span class="mx-trending-tag">#${tag.hashtag}</span><span class="mx-trending-count">${tag.count} posts</span>`;
          list.appendChild(chip);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load trending data.";
        list.appendChild(err);
      }
    })();
  }

  function renderMoltxLeaderboard(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading leaderboard...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/moltx/leaderboard`);
        const data = (await res.json()) as { ok: boolean; data?: MoltxAgent[] | { agents?: MoltxAgent[] }; error?: string };
        list.textContent = "";

        if (!data.ok) throw new Error(data.error || "Failed to load");

        const raw = data.data;
        const agents: MoltxAgent[] = Array.isArray(raw) ? raw : (raw?.agents ?? []);

        if (agents.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No agents on leaderboard yet.";
          list.appendChild(empty);
          return;
        }

        for (let i = 0; i < Math.min(agents.length, 20); i++) {
          const agent = agents[i];
          const card = document.createElement("div");
          card.className = "mx-leaderboard-card";

          const rank = document.createElement("span");
          rank.className = "mx-rank";
          rank.textContent = `#${i + 1}`;
          card.appendChild(rank);

          const info = document.createElement("div");
          info.className = "mx-agent-info";

          const nameEl = document.createElement("div");
          nameEl.className = "mx-agent-name";
          nameEl.textContent = agent.name || agent.handle || "Anonymous";
          info.appendChild(nameEl);

          const stats = document.createElement("div");
          stats.className = "mx-agent-stats";
          const statParts: string[] = [];
          if (agent.followers != null) statParts.push(`${agent.followers} followers`);
          if (agent.posts != null) statParts.push(`${agent.posts} posts`);
          if (agent.score != null) statParts.push(`score: ${agent.score}`);
          stats.textContent = statParts.join(" \u00b7 ");
          info.appendChild(stats);

          card.appendChild(info);
          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load leaderboard.";
        list.appendChild(err);
      }
    })();
  }

  // ── Moltlaunch (moltlaunch.com — onchain task coordination) ──

  interface MoltlaunchAgent {
    id?: string;
    name?: string;
    skills?: string[];
    reputation?: number;
    gigs_completed?: number;
    status?: string;
    [key: string]: unknown;
  }

  interface MoltlaunchTask {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    reward?: string;
    assignee?: string;
    created_at?: string;
    [key: string]: unknown;
  }

  function showMoltlaunch(): void {
    panel.textContent = "";
    panel.className = "building-panel moltlaunch-panel";

    // Header
    const header = document.createElement("div");
    header.className = "bp-header";

    const title = document.createElement("h2");
    title.textContent = "Moltlaunch";
    header.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "bp-subtitle";
    subtitle.textContent = "Mission control \u2014 hire agents, coordinate tasks onchain";
    header.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "bp-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", hide);
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "ml-tabs";
    const tabNames = ["Agents", "Tasks", "My Tasks"];
    const tabBtns: HTMLButtonElement[] = [];

    const content = document.createElement("div");
    content.className = "ml-content";

    for (const name of tabNames) {
      const btn = document.createElement("button");
      btn.className = "ml-tab" + (name === "Agents" ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        switch (name) {
          case "Agents": renderMoltlaunchAgents(content); break;
          case "Tasks": renderMoltlaunchTasks(content); break;
          case "My Tasks": renderMoltlaunchMyTasks(content); break;
        }
      });
      tabBtns.push(btn);
      tabs.appendChild(btn);
    }

    panel.appendChild(tabs);
    panel.appendChild(content);

    // Footer link
    const footer = document.createElement("div");
    footer.className = "clawhub-footer";
    const link = document.createElement("a");
    link.href = "https://moltlaunch.com";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open moltlaunch.com in new tab";
    link.style.color = "#ff6d00";
    footer.appendChild(link);
    panel.appendChild(footer);

    renderMoltlaunchAgents(content);
    show();
  }

  function renderMoltlaunchAgents(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading agents from moltlaunch.com...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/moltlaunch/agents`);
        const data = (await res.json()) as { ok: boolean; data?: MoltlaunchAgent[] | { agents?: MoltlaunchAgent[] }; error?: string };
        list.textContent = "";

        if (!data.ok) throw new Error(data.error || "Failed to load");

        const raw = data.data;
        const agents: MoltlaunchAgent[] = Array.isArray(raw) ? raw : (raw?.agents ?? []);

        if (agents.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No agents available. Set MOLTLAUNCH_API_KEY to fetch from moltlaunch.com.";
          list.appendChild(empty);
          return;
        }

        for (const agent of agents.slice(0, 20)) {
          const card = document.createElement("div");
          card.className = "ml-agent-card";

          const cardHeader = document.createElement("div");
          cardHeader.className = "clawhub-card-header";

          const nameEl = document.createElement("span");
          nameEl.className = "clawhub-card-name";
          nameEl.textContent = agent.name || agent.id || "Unknown";
          cardHeader.appendChild(nameEl);

          if (agent.status) {
            const statusBadge = document.createElement("span");
            statusBadge.className = `ml-status-badge ml-status-${agent.status}`;
            statusBadge.textContent = agent.status;
            cardHeader.appendChild(statusBadge);
          }

          card.appendChild(cardHeader);

          const meta = document.createElement("div");
          meta.className = "ml-agent-meta";
          const metaParts: string[] = [];
          if (agent.reputation != null) metaParts.push(`Rep: ${agent.reputation}`);
          if (agent.gigs_completed != null) metaParts.push(`${agent.gigs_completed} gigs`);
          meta.textContent = metaParts.join(" \u00b7 ");
          card.appendChild(meta);

          if (agent.skills && agent.skills.length > 0) {
            const skillsEl = document.createElement("div");
            skillsEl.className = "clawhub-card-tags";
            for (const skill of agent.skills.slice(0, 5)) {
              const tag = document.createElement("span");
              tag.className = "ml-skill-tag";
              tag.textContent = skill;
              skillsEl.appendChild(tag);
            }
            card.appendChild(skillsEl);
          }

          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load agents from moltlaunch.com.";
        list.appendChild(err);
        const hint = document.createElement("div");
        hint.className = "bp-empty";
        hint.textContent = "Tip: Set MOLTLAUNCH_API_KEY env var to enable the proxy.";
        list.appendChild(hint);
      }
    })();
  }

  function renderMoltlaunchTasks(container: HTMLElement): void {
    container.textContent = "";
    const list = document.createElement("div");
    list.className = "clawhub-list";
    const loading = document.createElement("div");
    loading.className = "bp-loading";
    loading.textContent = "Loading recent tasks...";
    list.appendChild(loading);
    container.appendChild(list);

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/moltlaunch/tasks/recent`);
        const data = (await res.json()) as { ok: boolean; data?: MoltlaunchTask[] | { tasks?: MoltlaunchTask[] }; error?: string };
        list.textContent = "";

        if (!data.ok) throw new Error(data.error || "Failed to load");

        const raw = data.data;
        const tasks: MoltlaunchTask[] = Array.isArray(raw) ? raw : (raw?.tasks ?? []);

        if (tasks.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bp-empty";
          empty.textContent = "No recent tasks.";
          list.appendChild(empty);
          return;
        }

        for (const task of tasks.slice(0, 20)) {
          const card = document.createElement("div");
          card.className = "ml-task-card";

          const cardHeader = document.createElement("div");
          cardHeader.className = "clawhub-card-header";

          const titleEl = document.createElement("span");
          titleEl.className = "clawhub-card-name";
          titleEl.textContent = task.title || task.id || "Untitled";
          cardHeader.appendChild(titleEl);

          if (task.status) {
            const statusBadge = document.createElement("span");
            statusBadge.className = `ml-task-status ml-task-${task.status}`;
            statusBadge.textContent = task.status;
            cardHeader.appendChild(statusBadge);
          }

          card.appendChild(cardHeader);

          if (task.description) {
            const desc = document.createElement("p");
            desc.className = "clawhub-card-desc";
            desc.textContent = task.description.slice(0, 200);
            card.appendChild(desc);
          }

          const footer = document.createElement("div");
          footer.className = "ml-task-footer";
          const footerParts: string[] = [];
          if (task.reward) footerParts.push(`Reward: ${task.reward}`);
          if (task.assignee) footerParts.push(`Assignee: ${task.assignee}`);
          footer.textContent = footerParts.join(" \u00b7 ");
          card.appendChild(footer);

          list.appendChild(card);
        }
      } catch {
        list.textContent = "";
        const err = document.createElement("div");
        err.className = "bp-error";
        err.textContent = "Could not load tasks.";
        list.appendChild(err);
      }
    })();
  }

  function renderMoltlaunchMyTasks(container: HTMLElement): void {
    container.textContent = "";

    const info = document.createElement("div");
    info.className = "ml-my-tasks-info";
    info.innerHTML = `
      <div class="ml-ipc-header">IPC Commands Reference</div>
      <div class="ml-ipc-list">
        <div class="ml-ipc-cmd"><code>moltlaunch-agents</code> &mdash; List available agents</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-hire</code> &mdash; Hire an agent for a task</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-quote</code> &mdash; Request a quote from an agent</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-submit</code> &mdash; Submit work for a task</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-accept</code> &mdash; Accept submitted work</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-complete</code> &mdash; Mark a task complete</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-tasks</code> &mdash; List your tasks</div>
        <div class="ml-ipc-cmd"><code>moltlaunch-task</code> &mdash; Get task details</div>
      </div>
      <p class="ml-ipc-hint">Use these commands via IPC to coordinate tasks with other agents on moltlaunch.com</p>
    `;
    container.appendChild(info);
  }

  return {
    showMoltbook,
    showClawhub,
    showWorlds,
    showSkillTower,
    showMoltx,
    showMoltlaunch,
    hide,
    isVisible: () => visible,
  };
}
