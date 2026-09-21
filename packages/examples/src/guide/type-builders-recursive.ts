import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// RT.self() stands for the whole shape, so the body can point back at itself.
const commentRunType = RT.circular(
  RT.object({
    text: TF.string(),
    replies: RT.array(RT.self()),
  })
);
type Comment = InferType<typeof commentRunType>; // {text: string; replies: Comment[]}

const isComment = createValidateFn(commentRunType);

// The same shape written as a type. Both reach the same validator.
type CommentType = {text: string; replies: CommentType[]};
const isCommentType = createValidateFn<CommentType>(); // same cached validator

export {commentRunType, isComment, isCommentType};
export type {Comment, CommentType};
