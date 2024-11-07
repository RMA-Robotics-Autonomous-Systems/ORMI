import styles from "./widget-card.module.css";
import WidgetDefinition from "../../widget-interface";

const WidgetCard = (props: { definition: WidgetDefinition }) => {
    return (
        <button className={styles.card}>
            <div
                className={styles.image}
                style={{ backgroundImage: `url(${props.definition.image})` }}
            >
                <div className={styles.overlay}>
                    <p className={styles.description}>{props.definition.description}</p>
                </div>
                <h2 className={styles.title}>{props.definition.name}</h2>
            </div>
        </button>
    );
};

export default WidgetCard;