import { Response } from "express";
import { Files, IRequest } from "../types/types";
import { ObjectId } from "mongodb";
import User from "../models/users";
import Tweet from "../models/tweets";
import streamifier from "streamifier";
import { cloud as cloudinary } from "../utils/cloudinaryConfig";
import bcrypt from "bcrypt";

export const editProfile = async (req: IRequest, res: Response) => {
  const id = req.user?._id;
  const { name, username, password, bio } = req.body;
  const files = req.files as Files;
  let profilePic: any = "";
  let coverPic: any = "";

  try {
    let user = await User.findById(id);
    if (files) {
      if (files.profilePic) {
        let upload_stream = cloudinary.uploader.upload_stream(
          {
            transformation: { width: 500, height: 500, crop: "fill" },
            folder: "profilePictures",
            public_id: `${id}-profile`,
            overwrite: true,
          },
          async (err, result) => {
            if (result) {
              user = await User.findByIdAndUpdate(id, {
                $set: { profilePic: result.secure_url },
              });
            }
          }
        );
        streamifier
          .createReadStream(files.profilePic[0].buffer)
          .pipe(upload_stream);
      }
      if (files.coverPic) {
        let upload_stream = cloudinary.uploader.upload_stream(
          {
            transformation: { width: 900, height: 350, crop: "fill" },
            folder: "coverPictures",
            public_id: `${id}-cover`,
            overwrite: true,
          },
          async (err, result) => {
            if (result) {
              user = await User.findByIdAndUpdate(id, {
                $set: { coverPic: result.secure_url },
              });
            }
          }
        );
        streamifier
          .createReadStream(files.coverPic[0].buffer)
          .pipe(upload_stream);
      }
    }
    await User.updateOne(
      { _id: id },
      {
        $set: {
          name: name,
          username: username,
          bio: bio,
        },
      }
    );
    if (password) {
      const salt = await bcrypt.genSalt();
      const encryptedPassword = await bcrypt.hash(password, salt);
      await User.updateOne(
        { _id: id },
        {
          $set: {
            password: encryptedPassword,
          },
        }
      );
    }
    if (files) {
      const updatedUser = await User.findById(id);
      res.status(200).json({
        data: {
          profilePic: updatedUser?.profilePic,
          coverPic: updatedUser?.coverPic,
        },
        message: "User info updated successfully",
      });
    } else {
      res.status(200).json({
        message: "User info updated successfully",
      });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err });
  }
};

export const tweetsAndRetweets = async (req: IRequest, res: Response) => {
  let skip = parseInt(req.params.skip);
  const id = req.params.userId;

  try {
    let tweets = await Tweet.aggregate([
      {
        $match: {
          tweetId: { $exists: false },
          $or: [
            { creator: new ObjectId(id) },
            { retweetedUsers: new ObjectId(id) },
          ],
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

export const media = async (req: IRequest, res: Response) => {
  let skip = parseInt(req.params.skip);
  const id = req.params.userId;

  try {
    let tweets = await Tweet.aggregate([
      {
        $match: {
          tweetId: { $exists: true },
          creator: new ObjectId(id),
          media: { $exists: true, $not: { $size: 0 } },
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
                creator: new ObjectId(id),
                media: { $exists: true, $not: { $size: 0 } },
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

export const liked = async (req: IRequest, res: Response) => {
  let skip = parseInt(req.params.skip);
  const id = req.params.userId;

  try {
    let tweets = await Tweet.aggregate([
      {
        $match: {
          tweetId: { $exists: true },
          likes: new ObjectId(id),
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
                likes: new ObjectId(id),
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

export const tweetsAndReplies = async (req: IRequest, res: Response) => {
  let skip = parseInt(req.params.skip);
  const id = req.params.userId;

  try {
    let tweets = await Tweet.aggregate([
      {
        $match: {
          tweetId: { $exists: true },
          creator: new ObjectId(id),
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
                creator: new ObjectId(id),
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
    console.log(err);
    res.status(400).json({ error: err });
  }
};
