import { Response } from "express";
import { IRequest } from "../types/types";
import { ObjectId } from "mongodb";
import User from "../models/users";
import Tweet from "../models/tweets";
import Hashtag from "../models/hashtags";

export const getPopularTags = async (req: IRequest, res: Response) => {
  const skip = parseInt(req.params.skip);
  const limit = parseInt(req.params.limit);
  const id = req.user?._id;

  try {
    const popularTags = await Hashtag.find()
      .sort({ tweets: -1 })
      .skip(skip)
      .limit(limit);
    res.status(200).json(popularTags);
  } catch (err) {
    res.status(400).json({ error: err });
  }
};

export const getPeopleSuggestions = async (req: IRequest, res: Response) => {
  const skip = parseInt(req.params.skip);
  const limit = parseInt(req.params.limit);
  const id = req.user?._id;

  try {
    const user = await User.findById(id);
    let following = user?.following ? user.following : [];
    following.push(id);
    const peopleSuggestions = await User.aggregate([
      {
        $match: {
          _id: { $nin: following },
        },
      },
      { $addFields: { followerCount: { $size: "$followers" } } },
      { $sort: { followerCount: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { name: 1, username: 1, profilePic: 1 } },
    ]);
    res.status(200).json(peopleSuggestions);
  } catch (err) {
    res.status(400).json({ error: err });
  }
};

export const getHomeTweets = async (req: IRequest, res: Response) => {
  const skip = parseInt(req.params.skip);
  const id = req.user?._id;
  try {
    const user = await User.findById(id);
    let tweets = await Tweet.aggregate([
      {
        $match: {
          tweetId: { $exists: true },
          $or: [
            { creator: new ObjectId(id) },
            { creator: { $in: user?.following } },
            { retweetedUsers: { $in: user?.following } },
          ],
        },
      },
      { $group: { _id: "$tweetId" } },
      {
        $lookup: {
          from: "tweets",
          localField: "_id",
          foreignField: "_id",
          as: "originalTweet",
        },
      },
      { $unwind: "$originalTweet" },
      {
        $lookup: {
          from: "users",
          localField: "originalTweet.creator",
          foreignField: "_id",
          as: "originalTweet.creator",
        },
      },
      {
        $addFields: {
          "originalTweet.retweeted": {
            $filter: {
              input: "$originalTweet.retweetedUsers",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          "originalTweet.saved": {
            $filter: {
              input: "$originalTweet.savedBy",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          "originalTweet.liked": {
            $filter: {
              input: "$originalTweet.likes",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          "originalTweet.fetchReply": true,
        },
      },
      {
        $lookup: {
          from: "tweets",
          let: { tweetid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$tweetId", "$$tweetid"] } } },
            { $group: { _id: null, count: { $sum: 1 } } },
            { $project: { _id: 0, count: 1 } },
          ],
          as: "count",
        },
      },
      {
        $project: {
          _id: "$originalTweet._id",
          "originalTweet._id": 1,
          "originalTweet.creator._id": 1,
          "originalTweet.creator.name": 1,
          "originalTweet.creator.username": 1,
          "originalTweet.creator.profilePic": 1,
          "originalTweet.tweet": 1,
          "originalTweet.media": 1,
          "originalTweet.liked": 1,
          "originalTweet.retweeted": 1,
          "originalTweet.retweetedUsers": {
            $size: "$originalTweet.retweetedUsers",
          },
          "originalTweet.saved": 1,
          "originalTweet.savedBy": { $size: "$originalTweet.savedBy" },
          "originalTweet.commentCount": "$count.count",
          "originalTweet.fetchReply": 1,
          "originalTweet.likes": { $size: "$originalTweet.likes" },
          "originalTweet.createdAt": 1,
          createdAt: "$originalTweet.createdAt",
        },
      },
      {
        $unionWith: {
          coll: "tweets",
          pipeline: [
            {
              $match: {
                tweetId: { $exists: false },
                $or: [
                  { creator: new ObjectId(id) },
                  { creator: { $in: user?.following } },
                  { retweetedUsers: { $in: user?.following } },
                ],
              },
            },
            {
              $addFields: {
                retweeted: {
                  $filter: {
                    input: "$retweetedUsers",
                    as: "user",
                    cond: {
                      $eq: ["$$user", new ObjectId(id)],
                    },
                  },
                },
                saved: {
                  $filter: {
                    input: "$savedBy",
                    as: "user",
                    cond: {
                      $eq: ["$$user", new ObjectId(id)],
                    },
                  },
                },
                liked: {
                  $filter: {
                    input: "$likes",
                    as: "user",
                    cond: {
                      $eq: ["$$user", new ObjectId(id)],
                    },
                  },
                },
                fetchReply: false,
              },
            },
            {
              $lookup: {
                from: "tweets",
                let: { tweetid: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$tweetId", "$$tweetid"] } } },
                  { $group: { _id: null, count: { $sum: 1 } } },
                  { $project: { _id: 0, count: 1 } },
                ],
                as: "count",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "creator",
                foreignField: "_id",
                as: "creator",
              },
            },
            {
              $project: {
                "creator._id": 1,
                "creator.name": 1,
                "creator.username": 1,
                "creator.profilePic": 1,
                tweet: 1,
                media: 1,
                likes: {
                  $cond: {
                    if: { $isArray: "$likes" },
                    then: { $size: "$likes" },
                    else: 0,
                  },
                },
                liked: 1,
                retweeted: 1,
                saved: 1,
                savedBy: { $size: "$savedBy" },
                retweetedUsers: { $size: "$retweetedUsers" },
                commentCount: "$count.count",
                createdAt: 1,
                fetchReply: 1,
              },
            },
          ],
        },
      },
      { $group: { _id: "$_id", tweet: { $push: "$$ROOT" } } },
      { $sort: { "tweet.createdAt": -1 } },
      { $skip: skip * 10 },
      { $limit: 10 },
    ]);
    tweets = tweets.map((item) => {
      if (item.tweet[0].originalTweet) return item.tweet[0].originalTweet;
      else return item.tweet[0];
    });
    res.status(200).json({ data: tweets });
  } catch (err) {
    res.status(400).json({ error: err });
  }
};

export const getBoomarks = async (req: IRequest, res: Response) => {
  const skip = parseInt(req.params.skip);
  const id = req.user?._id;

  try {
    let tweets = await Tweet.aggregate([
      {
        $match: {
          savedBy: id,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      { $skip: skip * 10 },
      { $limit: 10 },
      {
        $addFields: {
          retweeted: {
            $filter: {
              input: "$retweetedUsers",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          saved: {
            $filter: {
              input: "$savedBy",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          liked: {
            $filter: {
              input: "$likes",
              as: "user",
              cond: {
                $eq: ["$$user", new ObjectId(id)],
              },
            },
          },
          fetchReply: false,
        },
      },
      {
        $lookup: {
          from: "tweets",
          let: { tweetid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$tweetId", "$$tweetid"] } } },
            { $group: { _id: null, count: { $sum: 1 } } },
            { $project: { _id: 0, count: 1 } },
          ],
          as: "count",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $project: {
          "creator._id": 1,
          "creator.name": 1,
          "creator.username": 1,
          "creator.profilePic": 1,
          tweet: 1,
          media: 1,
          likes: {
            $cond: {
              if: { $isArray: "$likes" },
              then: { $size: "$likes" },
              else: 0,
            },
          },
          liked: 1,
          retweeted: 1,
          saved: 1,
          savedBy: { $size: "$savedBy" },
          retweetedUsers: { $size: "$retweetedUsers" },
          commentCount: "$count.count",
          createdAt: 1,
          fetchReply: 1,
        },
      },
    ]);
    res.status(200).json({ data: tweets });
  } catch (err) {
    res.status(400).json({ error: err });
  }
};
