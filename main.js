const { Plugin, ItemView } = require("obsidian");

const VIEW_TYPE_KNOWLEDGE_NAVIGATION =
    "knowledge-navigation-view";

const ROOT_KEY =
    "obsidian-knowledge-navigation-root";


/*
 * =============================================================
 * MOBILE GESTURE SETTINGS
 * =============================================================
 *
 * Less than 1 second:
 *     Normal tap -> open page
 *
 * 1 to 2 seconds:
 *     Change navigation root
 *
 * 2 seconds or more:
 *     Open in new pane/tab
 *
 * Movement greater than MOBILE_MOVE_THRESHOLD
 * cancels the gesture so scrolling does not trigger it.
 */

const MOBILE_ROOT_PRESS_TIME = 1000;
const MOBILE_NEW_PANE_PRESS_TIME = 2000;
const MOBILE_MOVE_THRESHOLD = 10;


class KnowledgeNavigationView extends ItemView {

    constructor(leaf) {

        super(leaf);

        /*
         * parent path -> children
         */

        this.childrenByParent = new Map();


        /*
         * page path -> parents
         */

        this.parentsByPage = new Map();


        /*
         * The next active-leaf-change was caused
         * intentionally by a right-click or mobile
         * root gesture.
         */

        this.ignoreNextActiveLeafChange = false;
    }


    getViewType() {

        return VIEW_TYPE_KNOWLEDGE_NAVIGATION;
    }


    getDisplayText() {

        return "Knowledge Navigation";
    }


    getIcon() {

        return "network";
    }


    async onOpen() {

        /*
         * Initial render.
         */

        this.renderNavigation();


        /*
         * Re-render after Obsidian resolves links.
         */

        this.registerEvent(
            this.app.metadataCache.on(
                "resolved",
                () => {
                    this.renderNavigation();
                }
            )
        );


        /*
         * =====================================================
         * ACTIVE PAGE CHANGE
         * =====================================================
         *
         * This is what makes the tree follow the page
         * when the user navigates somewhere else in Obsidian.
         *
         * Examples:
         *
         * - Clicking a link in a note
         * - Clicking a backlink
         * - Opening another tab
         * - Using search
         * - Using Obsidian navigation
         * - Opening a note from another plugin
         */

        this.registerEvent(
            this.app.workspace.on(
                "active-leaf-change",
                () => {

                    /*
                     * A right-click or mobile root gesture
                     * intentionally changed the page.
                     *
                     * Keep the manually selected root.
                     */

                    if (
                        this.ignoreNextActiveLeafChange
                    ) {

                        this.ignoreNextActiveLeafChange =
                            false;

                        this.renderNavigation();

                        return;
                    }


                    /*
                     * Normal navigation outside the tree.
                     *
                     * Follow the newly active page.
                     */

                    this.clearRootPath();

                    this.renderNavigation();
                }
            )
        );


        /*
         * Re-render when notes change.
         */

        this.registerEvent(
            this.app.vault.on(
                "modify",
                () => {
                    this.renderNavigation();
                }
            )
        );


        /*
         * Re-render when notes are created.
         */

        this.registerEvent(
            this.app.vault.on(
                "create",
                () => {
                    this.renderNavigation();
                }
            )
        );


        /*
         * Re-render when notes are deleted.
         */

        this.registerEvent(
            this.app.vault.on(
                "delete",
                () => {
                    this.renderNavigation();
                }
            )
        );
    }


    async onClose() {
    }


    /*
     * =========================================================
     * CURRENT PAGE
     * =========================================================
     */

    getCurrentPage() {

        const activeFile =
            this.app.workspace.getActiveFile();

        if (!activeFile) {
            return null;
        }

        if (
            activeFile.extension !== "md"
        ) {
            return null;
        }

        return {
            file: activeFile
        };
    }


    /*
     * =========================================================
     * ROOT STORAGE
     * =========================================================
     */

    getRootPath() {

        return sessionStorage.getItem(
            ROOT_KEY
        );
    }


    setRootPath(path) {

        sessionStorage.setItem(
            ROOT_KEY,
            path
        );
    }


    clearRootPath() {

        sessionStorage.removeItem(
            ROOT_KEY
        );
    }


    /*
     * =========================================================
     * GET PARENT
     * =========================================================
     */

    getParentPage(page) {

        const parents =
            this.parentsByPage.get(
                page.file.path
            );

        if (
            !parents ||
            parents.length === 0
        ) {
            return null;
        }

        return parents[0] || null;
    }


    /*
     * =========================================================
     * FIND ANCESTORS
     * =========================================================
     */

    getAncestorPages(
        page,
        maxDepth = 2
    ) {

        const ancestors = [];

        let current = page;

        const visited = new Set();

        while (
            current &&
            ancestors.length < maxDepth
        ) {

            const parent =
                this.getParentPage(
                    current
                );

            if (!parent) {
                break;
            }

            if (
                visited.has(
                    parent.file.path
                )
            ) {
                break;
            }

            visited.add(
                parent.file.path
            );

            ancestors.push(
                parent
            );

            current = parent;
        }

        return ancestors;
    }


    /*
     * =========================================================
     * HANDLE MOBILE GESTURE
     * =========================================================
     *
     * This handles:
     *
     * Tap:
     *     < 1 second
     *
     * Medium hold:
     *     1–2 seconds
     *
     * Long hold:
     *     2+ seconds
     *
     * Movement cancels the gesture.
     */

    addMobileGesture(
        element,
        file,
        options = {}
    ) {

        let touchStartTime = 0;

        let touchStartX = 0;

        let touchStartY = 0;

        let touchMoved = false;

        let gestureHandled = false;


        /*
         * TOUCH START
         */

        element.addEventListener(
            "touchstart",
            event => {

                if (
                    event.touches.length !== 1
                ) {
                    return;
                }


                const touch =
                    event.touches[0];


                touchStartTime =
                    Date.now();


                touchStartX =
                    touch.clientX;


                touchStartY =
                    touch.clientY;


                touchMoved =
                    false;


                gestureHandled =
                    false;
            },
            {
                passive: true
            }
        );


        /*
         * TOUCH MOVE
         *
         * If the finger moves, this is probably
         * scrolling rather than a long press.
         */

        element.addEventListener(
            "touchmove",
            event => {

                if (
                    !touchStartTime
                ) {
                    return;
                }


                const touch =
                    event.touches[0];


                if (!touch) {
                    return;
                }


                const movementX =
                    Math.abs(
                        touch.clientX -
                        touchStartX
                    );


                const movementY =
                    Math.abs(
                        touch.clientY -
                        touchStartY
                    );


                if (
                    movementX >
                        MOBILE_MOVE_THRESHOLD ||
                    movementY >
                        MOBILE_MOVE_THRESHOLD
                ) {

                    touchMoved =
                        true;
                }
            },
            {
                passive: true
            }
        );


        /*
         * TOUCH CANCEL
         */

        element.addEventListener(
            "touchcancel",
            () => {

                touchStartTime =
                    0;

                touchMoved =
                    true;

                gestureHandled =
                    true;
            }
        );


        /*
         * TOUCH END
         */

        element.addEventListener(
            "touchend",
            async event => {

                if (
                    !touchStartTime
                ) {
                    return;
                }


                const duration =
                    Date.now() -
                    touchStartTime;


                const touch =
                    event.changedTouches[0];


                if (!touch) {

                    touchStartTime =
                        0;

                    return;
                }


                const movementX =
                    Math.abs(
                        touch.clientX -
                        touchStartX
                    );


                const movementY =
                    Math.abs(
                        touch.clientY -
                        touchStartY
                    );


                touchStartTime =
                    0;


                /*
                 * Finger moved:
                 * this was scrolling.
                 */

                if (
                    touchMoved ||
                    movementX >
                        MOBILE_MOVE_THRESHOLD ||
                    movementY >
                        MOBILE_MOVE_THRESHOLD
                ) {

                    return;
                }


                /*
                 * Prevent the normal browser/Obsidian
                 * click from firing after our gesture.
                 */

                event.preventDefault();

                event.stopPropagation();


                /*
                 * =================================================
                 * 2+ SECONDS
                 *
                 * Open in new pane.
                 * =================================================
                 */

                if (
                    duration >=
                    MOBILE_NEW_PANE_PRESS_TIME
                ) {

                    gestureHandled =
                        true;


                    await this.openInNewPane(
                        file
                    );

                    return;
                }


                /*
                 * =================================================
                 * 1–2 SECONDS
                 *
                 * Change navigation root.
                 * =================================================
                 */

                if (
                    duration >=
                    MOBILE_ROOT_PRESS_TIME
                ) {

                    gestureHandled =
                        true;


                    this.ignoreNextActiveLeafChange =
                        true;


                    this.setRootPath(
                        file.path
                    );


                    await this.openInMainPane(
                        file
                    );


                    this.renderNavigation();

                    return;
                }


                /*
                 * =================================================
                 * LESS THAN 1 SECOND
                 *
                 * Normal tap.
                 * =================================================
                 */

                if (
                    options.onTap
                ) {

                    await options.onTap();
                }
            },
            {
                passive: false
            }
        );


        /*
         * Prevent a touch gesture that was already handled
         * from triggering the normal click handler.
         */

        element.addEventListener(
            "click",
            event => {

                if (
                    gestureHandled
                ) {

                    event.preventDefault();

                    event.stopPropagation();

                    gestureHandled =
                        false;
                }
            },
            true
        );
    }


    /*
     * =========================================================
     * BACK NAVIGATION
     * =========================================================
     */

    renderBackNavigation(
        container,
        currentPage
    ) {

        const ancestors =
            this.getAncestorPages(
                currentPage,
                2
            );

        if (
            ancestors.length === 0
        ) {
            return;
        }


        const backNav =
            container.createDiv();

        backNav.style.marginBottom =
            "5px";


        /*
         * Parent -> Grandparent
         *
         * Reverse so highest category appears first.
         */

        const orderedAncestors =
            [...ancestors].reverse();


        orderedAncestors.forEach(
            ancestor => {

                const row =
                    backNav.createDiv();

                row.style.display =
                    "flex";

                row.style.alignItems =
                    "center";

                row.style.height =
                    "23px";

                row.style.minHeight =
                    "23px";

                row.style.padding =
                    "0";


                /*
                 * =================================================
                 * ARROW
                 * =================================================
                 */

                const arrow =
                    row.createEl(
                        "span"
                    );

                arrow.textContent =
                    "◀";

                arrow.style.display =
                    "inline-flex";

                arrow.style.alignItems =
                    "center";

                arrow.style.justifyContent =
                    "center";

                arrow.style.width =
                    "18px";

                arrow.style.minWidth =
                    "18px";

                arrow.style.fontSize =
                    "10px";

                arrow.style.fontWeight =
                    "bold";

                arrow.style.color =
                    "var(--text-muted)";

                arrow.style.cursor =
                    "pointer";


                /*
                 * =================================================
                 * ANCESTOR LINK
                 * =================================================
                 */

                const link =
                    row.createEl(
                        "a"
                    );

                link.textContent =
                    ancestor.file.basename;

                link.href =
                    "#";

                link.style.cursor =
                    "pointer";

                link.style.textDecoration =
                    "none";


                /*
                 * Desktop left click.
                 */

                link.addEventListener(
                    "click",
                    async event => {

                        if (
                            event.ctrlKey ||
                            event.metaKey ||
                            event.shiftKey ||
                            event.altKey
                        ) {
                            return;
                        }


                        event.preventDefault();


                        await this.openInMainPane(
                            ancestor.file
                        );
                    }
                );


                /*
                 * Desktop middle click.
                 */

                link.addEventListener(
                    "mousedown",
                    async event => {

                        if (
                            event.button !== 1
                        ) {
                            return;
                        }


                        event.preventDefault();

                        event.stopPropagation();


                        await this.openInNewPane(
                            ancestor.file
                        );
                    }
                );


                /*
                 * Desktop right click.
                 */

                link.addEventListener(
                    "contextmenu",
                    async event => {

                        event.preventDefault();

                        event.stopPropagation();


                        this.ignoreNextActiveLeafChange =
                            true;


                        this.setRootPath(
                            ancestor.file.path
                        );


                        await this.openInMainPane(
                            ancestor.file
                        );


                        this.renderNavigation();
                    }
                );


                /*
                 * Mobile gesture.
                 */

                this.addMobileGesture(
                    link,
                    ancestor.file,
                    {
                        onTap:
                            async () => {

                                await this.openInMainPane(
                                    ancestor.file
                                );
                            }
                    }
                );


                /*
                 * =================================================
                 * ARROW LEFT CLICK
                 * =================================================
                 */

                arrow.addEventListener(
                    "click",
                    async event => {

                        event.preventDefault();

                        event.stopPropagation();


                        await this.openInMainPane(
                            ancestor.file
                        );
                    }
                );


                /*
                 * Arrow middle click.
                 */

                arrow.addEventListener(
                    "mousedown",
                    async event => {

                        if (
                            event.button !== 1
                        ) {
                            return;
                        }


                        event.preventDefault();

                        event.stopPropagation();


                        await this.openInNewPane(
                            ancestor.file
                        );
                    }
                );


                /*
                 * Arrow right click.
                 */

                arrow.addEventListener(
                    "contextmenu",
                    async event => {

                        event.preventDefault();

                        event.stopPropagation();


                        this.ignoreNextActiveLeafChange =
                            true;


                        this.setRootPath(
                            ancestor.file.path
                        );


                        await this.openInMainPane(
                            ancestor.file
                        );


                        this.renderNavigation();
                    }
                );


                /*
                 * Arrow mobile gesture.
                 */

                this.addMobileGesture(
                    arrow,
                    ancestor.file,
                    {
                        onTap:
                            async () => {

                                await this.openInMainPane(
                                    ancestor.file
                                );
                            }
                    }
                );


                /*
                 * Separator.
                 */

                const separator =
                    backNav.createDiv();

                separator.style.height =
                    "1px";

                separator.style.backgroundColor =
                    "var(--background-modifier-border)";

                separator.style.margin =
                    "0";
            }
        );
    }


    /*
     * =========================================================
     * OPEN NOTE IN MAIN PANE
     * =========================================================
     */

    async openInMainPane(file) {

        const leaves =
            this.app.workspace
                .getLeavesOfType(
                    "markdown"
                );


        const navigationLeaves =
            this.app.workspace
                .getLeavesOfType(
                    VIEW_TYPE_KNOWLEDGE_NAVIGATION
                );


        /*
         * Find a Markdown leaf that is not
         * the navigation pane.
         */

        let targetLeaf =
            leaves.find(
                leaf =>
                    !navigationLeaves.includes(
                        leaf
                    )
            );


        /*
         * If there is no Markdown leaf,
         * create another leaf.
         */

        if (!targetLeaf) {

            targetLeaf =
                this.app.workspace
                    .getLeaf(false);
        }


        if (targetLeaf) {

            await targetLeaf.openFile(
                file
            );
        }
    }


    /*
     * =========================================================
     * OPEN NOTE IN NEW PANE
     * =========================================================
     *
     * Desktop:
     *     Creates a split.
     *
     * Mobile:
     *     Obsidian decides how the new leaf
     *     is placed according to the mobile layout.
     */

    async openInNewPane(file) {

        const leaf =
            this.app.workspace.getLeaf(
                "split"
            );


        if (!leaf) {
            return;
        }


        await leaf.openFile(
            file
        );
    }


    /*
     * =========================================================
     * LOAD ALL MARKDOWN FILES
     * =========================================================
     */

    getPages() {

        const files =
            this.app.vault
                .getMarkdownFiles();


        return files.map(
            file => ({
                file
            })
        );
    }


    /*
     * =========================================================
     * BUILD LINK INDEX
     * =========================================================
     *
     * Child -> Parent is determined by normal
     * Obsidian wikilinks.
     *
     * Example:
     *
     * Georg Cantor.md
     *
     *     [[Mathematicians]]
     *
     * becomes:
     *
     * Mathematicians
     *     -> Georg Cantor
     */

    buildParentIndex(pages) {

        const childrenByParent =
            new Map();


        const parentsByPage =
            new Map();


        /*
         * Fast path lookup.
         */

        const pageByPath =
            new Map();


        for (const page of pages) {

            pageByPath.set(
                page.file.path,
                page
            );
        }


        /*
         * Read Obsidian metadata.
         */

        for (const page of pages) {

            const cache =
                this.app.metadataCache
                    .getFileCache(
                        page.file
                    );


            if (
                !cache ||
                !cache.links
            ) {
                continue;
            }


            /*
             * Every real wikilink.
             */

            for (
                const linkInfo
                of cache.links
            ) {

                const targetFile =
                    this.app.metadataCache
                        .getFirstLinkpathDest(
                            linkInfo.link,
                            page.file.path
                        );


                if (!targetFile) {
                    continue;
                }


                /*
                 * Only Markdown notes participate.
                 */

                if (
                    targetFile.extension !== "md"
                ) {
                    continue;
                }


                const parentPage =
                    pageByPath.get(
                        targetFile.path
                    );


                if (!parentPage) {
                    continue;
                }


                /*
                 * Parent -> Child.
                 */

                let children =
                    childrenByParent.get(
                        targetFile.path
                    );


                if (!children) {

                    children = [];

                    childrenByParent.set(
                        targetFile.path,
                        children
                    );
                }


                if (
                    !children.some(
                        child =>
                            child.file.path ===
                            page.file.path
                    )
                ) {

                    children.push(
                        page
                    );
                }


                /*
                 * Child -> Parent.
                 */

                let parents =
                    parentsByPage.get(
                        page.file.path
                    );


                if (!parents) {

                    parents = [];

                    parentsByPage.set(
                        page.file.path,
                        parents
                    );
                }


                if (
                    !parents.some(
                        parent =>
                            parent.file.path ===
                            parentPage.file.path
                    )
                ) {

                    parents.push(
                        parentPage
                    );
                }
            }
        }


        /*
         * Alphabetical children.
         */

        for (
            const children
            of childrenByParent.values()
        ) {

            children.sort(
                (a, b) =>
                    a.file.basename.localeCompare(
                        b.file.basename
                    )
            );
        }


        return {
            childrenByParent,
            parentsByPage
        };
    }


    /*
     * =========================================================
     * GET CHILDREN
     * =========================================================
     */

    getChildren(page) {

        return this.childrenByParent.get(
            page.file.path
        ) || [];
    }


    /*
     * =========================================================
     * RENDER NAVIGATION
     * =========================================================
     */

    renderNavigation() {

        const container =
            this.containerEl.children[1];


        if (!container) {
            return;
        }


        container.empty();


        container.style.padding =
            "8px 10px 20px 0px";


        const pages =
            this.getPages();


        const indexes =
            this.buildParentIndex(
                pages
            );


        this.childrenByParent =
            indexes.childrenByParent;


        this.parentsByPage =
            indexes.parentsByPage;


        /*
         * Manual root has priority.
         */

        let currentPage =
            null;


        const rootPath =
            this.getRootPath();


        if (rootPath) {

            currentPage =
                pages.find(
                    page =>
                        page.file.path ===
                        rootPath
                ) || null;
        }


        /*
         * Otherwise follow active page.
         */

        if (!currentPage) {

            currentPage =
                this.getCurrentPage();
        }


        /*
         * No active Markdown page:
         * show top-level notes.
         */

        if (!currentPage) {

            const roots =
                pages.filter(
                    page =>
                        !this.parentsByPage.has(
                            page.file.path
                        )
                );


            for (const root of roots) {

                this.renderNode(
                    container,
                    root,
                    0
                );
            }


            return;
        }


        /*
         * Back navigation.
         */

        this.renderBackNavigation(
            container,
            currentPage
        );


        /*
         * Current page becomes the
         * starting point of the tree.
         */

        this.renderNode(
            container,
            currentPage,
            0
        );
    }


    /*
     * =========================================================
     * RENDER ONE NODE
     * =========================================================
     */

    renderNode(
        container,
        page,
        level,
        path = new Set()
    ) {

        /*
         * Prevent circular relationships.
         */

        if (
            path.has(
                page.file.path
            )
        ) {
            return;
        }


        const nextPath =
            new Set(path);


        nextPath.add(
            page.file.path
        );


        const children =
            this.getChildren(
                page
            );


        /*
         * =====================================================
         * BRANCH
         * =====================================================
         */

        const branch =
            container.createDiv();


        branch.style.position =
            "relative";


        branch.style.left =
            "10px";


        /*
         * =====================================================
         * ROW
         * =====================================================
         */

        const row =
            branch.createDiv();


        row.style.position =
            "relative";


        row.style.left =
            "0px";


        row.style.display =
            "flex";


        row.style.alignItems =
            "center";


        row.style.minHeight =
            "28px";


        row.style.paddingLeft =
            "0px";


        /*
         * =====================================================
         * CONTENT
         * =====================================================
         */

        const content =
            row.createDiv();


        content.style.display =
            "flex";


        content.style.alignItems =
            "center";


        /*
         * =====================================================
         * ARROW
         * =====================================================
         */

        const arrow =
            content.createEl(
                "span"
            );


        arrow.style.width =
            "18px";


        arrow.style.minWidth =
            "18px";


        arrow.style.display =
            "inline-flex";


        arrow.style.alignItems =
            "center";


        arrow.style.justifyContent =
            "center";


        arrow.style.fontSize =
            "12px";


        if (
            children.length > 0
        ) {

            arrow.textContent =
                level < 1
                    ? "▼"
                    : "▶";


            arrow.style.cursor =
                "pointer";


            arrow.style.color =
                "var(--text-normal)";

        } else {

            arrow.textContent =
                "▶";


            arrow.style.opacity =
                "0.25";


            arrow.style.cursor =
                "default";
        }


        /*
         * =====================================================
         * NOTE LINK
         * =====================================================
         */

        const link =
            content.createEl(
                "a"
            );


        link.className =
            "internal-link";


        link.textContent =
            page.file.basename;


        link.dataset.href =
            page.file.path;


        link.href =
            page.file.path;


        link.style.cursor =
            "pointer";


        /*
         * =====================================================
         * CHILDREN
         * =====================================================
         */

        let childContainer =
            null;


        if (
            children.length > 0
        ) {

            childContainer =
                branch.createDiv();


            childContainer.style.position =
                "relative";


            childContainer.style.display =
                level < 1
                    ? "block"
                    : "none";


            childContainer.style.marginLeft =
                "4.2px";


            /*
             * Vertical hierarchy line.
             */

            const line =
                childContainer.createDiv();


            line.style.position =
                "absolute";


            line.style.left =
                "5px";


            line.style.top =
                "0";


            line.style.bottom =
                "0";


            line.style.width =
                "2px";


            line.style.backgroundColor =
                "var(--background-modifier-border)";


            /*
             * Children container.
             */

            const childrenContainer =
                childContainer.createDiv();


            childrenContainer.style.marginLeft =
                "0";


            childrenContainer.style.paddingLeft =
                "0";


            for (
                const child
                of children
            ) {

                this.renderNode(
                    childrenContainer,
                    child,
                    level + 1,
                    nextPath
                );
            }
        }


        /*
         * =====================================================
         * EXPAND / COLLAPSE
         * =====================================================
         */

        if (
            children.length > 0
        ) {

            arrow.addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    const expanded =
                        childContainer.style.display !==
                        "none";


                    if (expanded) {

                        childContainer.style.display =
                            "none";


                        arrow.textContent =
                            "▶";

                    } else {

                        childContainer.style.display =
                            "block";


                        arrow.textContent =
                            "▼";
                    }
                }
            );
        }


        /*
         * =====================================================
         * DESKTOP LEFT CLICK
         * =====================================================
         *
         * Only opens the page.
         *
         * The active-leaf-change event will then
         * automatically make the tree follow it.
         */

        link.addEventListener(
            "click",
            async event => {

                if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                ) {
                    return;
                }


                event.preventDefault();


                await this.openInMainPane(
                    page.file
                );
            }
        );


        /*
         * =====================================================
         * DESKTOP MIDDLE CLICK
         * =====================================================
         *
         * Opens the page in a new pane.
         */

        link.addEventListener(
            "mousedown",
            async event => {

                if (
                    event.button !== 1
                ) {
                    return;
                }


                event.preventDefault();

                event.stopPropagation();


                await this.openInNewPane(
                    page.file
                );
            }
        );


        /*
         * =====================================================
         * DESKTOP RIGHT CLICK
         * =====================================================
         *
         * Changes the navigation root.
         */

        link.addEventListener(
            "contextmenu",
            async event => {

                event.preventDefault();

                event.stopPropagation();


                /*
                 * This active page change is intentional.
                 */

                this.ignoreNextActiveLeafChange =
                    true;


                this.setRootPath(
                    page.file.path
                );


                await this.openInMainPane(
                    page.file
                );


                this.renderNavigation();
            }
        );


        /*
         * =====================================================
         * MOBILE GESTURES
         * =====================================================
         */

        this.addMobileGesture(
            link,
            page.file,
            {
                onTap:
                    async () => {

                        await this.openInMainPane(
                            page.file
                        );
                    }
            }
        );
    }
}


/*
 * =============================================================
 * PLUGIN
 * =============================================================
 */

module.exports =
class KnowledgeNavigationPlugin
    extends Plugin {


    async onload() {

        /*
         * =====================================================
         * PRINT HIDING
         * =====================================================
         */

        this.registerMarkdownPostProcessor(
            element => {

                const elements =
                    element.querySelectorAll(
                        "p"
                    );


                let insideParentBlock =
                    false;


                for (
                    const el of elements
                ) {

                    const text =
                        el.textContent.trim();


                    /*
                     * Start of parent block.
                     */

                    if (
                        !insideParentBlock &&
                        text.startsWith(
                            "//PARENTS"
                        )
                    ) {

                        el.classList.add(
                            "knowledge-parent-print-hidden"
                        );


                        if (
                            text.endsWith(
                                "//"
                            )
                        ) {

                            insideParentBlock =
                                false;

                        } else {

                            insideParentBlock =
                                true;
                        }


                        continue;
                    }


                    /*
                     * Inside parent block.
                     */

                    if (
                        insideParentBlock
                    ) {

                        el.classList.add(
                            "knowledge-parent-print-hidden"
                        );


                        if (
                            text === "//" ||
                            text.endsWith("//")
                        ) {

                            insideParentBlock =
                                false;
                        }
                    }
                }
            }
        );


        /*
         * =====================================================
         * VIEW
         * =====================================================
         */

        this.registerView(
            VIEW_TYPE_KNOWLEDGE_NAVIGATION,
            leaf =>
                new KnowledgeNavigationView(
                    leaf
                )
        );


        /*
         * =====================================================
         * RIBBON
         * =====================================================
         */

        this.addRibbonIcon(
            "network",
            "Open Knowledge Navigation",
            () => {

                this.activateView();
            }
        );


        /*
         * =====================================================
         * COMMAND
         * =====================================================
         */

        this.addCommand({

            id:
                "open-knowledge-navigation",

            name:
                "Open Knowledge Navigation",

            callback:
                () => {

                    this.activateView();
                }
        });
    }


    /*
     * =========================================================
     * ACTIVATE VIEW
     * =========================================================
     */

    async activateView() {

        const existing =
            this.app.workspace
                .getLeavesOfType(
                    VIEW_TYPE_KNOWLEDGE_NAVIGATION
                );


        if (
            existing.length > 0
        ) {

            this.app.workspace
                .revealLeaf(
                    existing[0]
                );


            const view =
                existing[0].view;


            if (
                view &&
                typeof view.renderNavigation ===
                    "function"
            ) {

                view.renderNavigation();
            }


            return;
        }


        const leaf =
            this.app.workspace
                .getRightLeaf(false);


        if (!leaf) {
            return;
        }


        await leaf.setViewState({

            type:
                VIEW_TYPE_KNOWLEDGE_NAVIGATION,

            active:
                true
        });


        this.app.workspace
            .revealLeaf(
                leaf
            );
    }
};