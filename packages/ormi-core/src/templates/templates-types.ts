import { Widget } from "../widgets";

export interface Template{
    name: string;
    widget: Widget;
    public: boolean;
    tags: string[];
    yours: boolean;
}

/*

model TemplateWidget {
    id        Int      @id @default(autoincrement())
    name      String
    content   Json?
    createdAT DateTime @default(now())
    updatedAT DateTime @default(now())

    createdBy   User   @relation(fields: [createdById], references: [id])
    createdById String

    public Boolean  @default(false)
    tags   String[]
}
    
*/