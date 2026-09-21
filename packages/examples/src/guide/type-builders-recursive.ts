import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

const commentRunType = RT.circular(
  RT.object({
    text: TF.string(),
    replies: RT.array(RT.self()), // RT.self() stands for the whole shape
  })
);
type Comment = InferType<typeof commentRunType>; // {text: string; replies: Comment[]}

const isComment = createValidateFn(commentRunType);

// the same shape written as a type
type CommentType = {text: string; replies: CommentType[]};
const isCommentType = createValidateFn<CommentType>(); // same cached validator

export {commentRunType, isComment, isCommentType};
export type {Comment, CommentType};
