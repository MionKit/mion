export type ID = string | number;

export type ApiUser = {
    id: ID;
    groups: ID[];
};

export type ApiModel = {
    id: ID;
    user: ID;
    groups: ID[];
};

export type RelationshipGraph = {
    [key: string]: RelationshipGraph;
};

export interface ApiQuery<H, P> {
    relationshipGraph: RelationshipGraph;
}
