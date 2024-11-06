import styles from "./page.module.css";

import PluginsLoader from "@/core/plugins/plugins-loader";

export default function Home() {

    PluginsLoader.Load();



    return (
        <div className={styles.page}>
            <main className={styles.main}>

            </main>
            <footer className={styles.footer}>

            </footer>
        </div>
    );
}
