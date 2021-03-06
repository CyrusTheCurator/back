const router = require("express").Router();
const Users = require("./users-model");
const Account = require("./account-model");
const recsRouter = require("./recommendations-router");
const axios = require("axios");
const FormData = require("form-data");
router.use("/recs", recsRouter);

function turnIDsIntoInfo(effects, flavors, descriptions) {
  let resObj = {};
  console.log(effects);
  console.log(flavors);
  if (effects.length === 0 || flavors.length === 0) {
    return null;
  }
  effects.forEach((effect) => {
    if (!resObj[effect.listName]) {
      resObj[effect.listName] = {
        effects: [],
      };
    }
    resObj = {
      ...resObj,
      [effect.listName]: {
        ...resObj[effect.listName],
        effects: [...resObj[effect.listName].effects, effect.effect],
      },
    };
  });

  flavors.forEach((flavor) => {
    if (resObj[flavor.listName].flavors === undefined) {
      resObj[flavor.listName] = {
        effects: [...resObj[flavor.listName].effects],
        flavors: [],
      };
    }

    resObj = {
      ...resObj,
      [flavor.listName]: {
        ...resObj[flavor.listName],
        flavors: [...resObj[flavor.listName].flavors, flavor.flavor],
      },
    };
  });

  descriptions.forEach((description) => {
    if (resObj[description.listName].descriptions === undefined) {
      resObj[description.listName] = {
        effects: [...resObj[description.listName].effects],
        flavors: resObj[description.listName].flavors,

        description: [],
      };
    }
    console.log(description, " this shouldn't be undefined");
    resObj = {
      ...resObj,
      [description.listName]: {
        ...resObj[description.listName],
        description: [
          ...resObj[description.listName].description,
          description.userDescription,
        ],
      },
    };
  });
  console.log("the res obj coign back isssss ", resObj);
  return resObj;
}

async function makePrefstringFromList(id, listName) {
  let prefs = [];

  let effects = await Users.getList(id, "effects", listName);
  let flavors = await Users.getList(id, "flavors", listName);
  let descriptions = await Users.getList(id, "list_descriptions", listName);
  let resObj = turnIDsIntoInfo(effects, flavors, descriptions);
  if (resObj === null) {
    return null;
  }
  resObj = resObj[Object.keys(resObj)[0]];

  resObj.effects.map((effect) => {
    prefs.push(effect);
  });
  resObj.flavors.map((flavors) => {
    prefs.push(flavors);
  });
  prefs.push(resObj.description[0]);
  let prefsString = prefs.join(" ");
  console.log("DS Query Processed: ", prefsString);
  return prefsString;
}

async function getRecs(prefs) {
  try {
    const formData = new FormData();

    formData.append("Flavors/Effects", prefs);

    const recResponse = await axios.post(
      "https://medcabinet-ds.herokuapp.com/recommend",
      formData,
      {
        // You need to use `getHeaders()` in Node.js because Axios doesn't
        // automatically set the multipart form boundary in Node.
        headers: formData.getHeaders(),
      }
    );
    const recommendations = recResponse.data;

    return recommendations;
  } catch (err) {
    return err.message;
  }
}

router.get("/", (req, res) => {
  let user = req.decodedJwt.username;

  res.status(200).json({
    message: `welcome to your secret page, ${user}. :)`,
  });
});

router.get("/lists", async (req, res) => {
  try {
    let id = req.decodedJwt.subject;
    let user = req.decodedJwt.username;

    let listName = req.body.listName;

    let effects = await Users.getLists(id, "effects");
    let flavors = await Users.getLists(id, "flavors");
    let descriptions = await Users.getLists(id, "list_descriptions");
    let resObj = turnIDsIntoInfo(effects, flavors, descriptions);
    if (resObj === null) {
      res.status(404).json({
        message: "THAT LIST DOES NOT EXIST! SILENCE!",
        error: 404,
      });
    }

    res.status(200).json({
      message: `better data shapes, happier users. Wouldn't you say, ${user}? :)`,
      resObj: resObj,
    });
  } catch (err) {
    res.status(500).json({
      message: "Something went wrong",
      err: err,
      errmessage: err.message,
    });
  }
});

router.get("/recommendations/:listName", async (req, res) => {
  try {
    let { listName } = req.params;
    let id = req.decodedJwt.subject;
    // let exists = await Users.getUserById(id);
    // if (exists.length < 1) {
    //   res.status(404).json({
    //     message: "bruh. that user doesn't exist. Sorry.",
    //     error: "That's a bummer for ya",
    //   });
    // }
    let prefsString = await makePrefstringFromList(id, listName);
    if (prefsString === null) {
      res.status(404).json({
        message: "Silence, Mortal. That list doesn't exist",
        error: 404,
      });
    }
    let recommendations = await getRecs(prefsString);

    res.status(200).json({
      message: `herez yer weeeds `,
      recommendations: recommendations,
    });
  } catch (err) {
    res.status(500).json({
      message: "Something went wrong",
      err: err,
      errmessage: err.message,
    });
  }
});

router.post("/add-list", async (req, res) => {
  try {
    let user = req.decodedJwt.username;
    let listName = req.body.listName;
    let id = req.decodedJwt.subject;
    let newPreferences = req.body;

    let exists = await Users.getListId(listName, id);
    if (exists.length > 0) {
      res.status(400).json({
        message: "bruh. a list with that name already exists.",
        error: "That's a bummer for ya",
      });
    }
    console.log();
    await Users.addList(listName, id);
    let newList = await Users.getListId(listName, id);
    let allFlavors = await Users.getEffectOrFlavorIds("flavor");
    let allEffects = await Users.getEffectOrFlavorIds("effect");
    let newListId = newList[0].id;
    let payload = {
      flavors: [],
      effects: [],
      listName: newPreferences.listName,
      descriptionObj: {
        description: newPreferences.description,
        list_ID: newListId,
      },
    };

    const someFlavors = allFlavors.filter((flavor) => {
      return newPreferences.flavors.some(function (e) {
        return e == flavor.flavor;
      });
    });

    const someEffects = allEffects.filter((effect) => {
      return newPreferences.effects.some(function (e) {
        return e == effect.effect;
      });
    });

    someFlavors.map((flavor) => {
      payload.flavors.push({ list_id: newListId, flavor_id: flavor.id });
    });
    someEffects.map((effect) => {
      payload.effects.push({ list_id: newListId, effect_id: effect.id });
    });

    await Users.updatePrefs(payload.flavors, "flavor");
    await Users.updatePrefs(payload.effects, "effect");

    if (req.body.description) {
      await Users.updatePrefs(payload.descriptionObj, "description");
    }
    let prefsString = await makePrefstringFromList(id, listName);

    let recommendations = await getRecs(prefsString);

    res.status(200).json({
      message: `you just CREATED list: ${listName}, ${user} `,
      recommendations: recommendations,
    });
  } catch (err) {
    res.status(500).json({
      message: "Something went wrong",
      err: err,
      errmessage: err.message,
    });
  }
});

router.put("/update-list", async (req, res) => {
  try {
    let user = req.decodedJwt.username;
    let listName = req.body.listName;
    let id = req.decodedJwt.subject;
    let newPreferences = req.body;

    let exists = await Users.getListId(listName, id);
    if (exists.length < 1) {
      res.status(400).json({
        message: "bruh. a list with that name doesn't exist",
        error: "That's a bummer for ya",
      });
    }
    await Users.deleteList(listName, id);
    await Users.addList(listName, id);
    let newList = await Users.getListId(listName, id);
    let allFlavors = await Users.getEffectOrFlavorIds("flavor");
    let allEffects = await Users.getEffectOrFlavorIds("effect");
    let newListId = newList[0].id;
    let payload = {
      flavors: [],
      effects: [],
      listName: newPreferences.listName,
      descriptionObj: {
        description: newPreferences.description,
        list_ID: newListId,
      },
    };

    const someFlavors = allFlavors.filter((flavor) => {
      return newPreferences.flavors.some(function (e) {
        return e == flavor.flavor;
      });
    });

    const someEffects = allEffects.filter((effect) => {
      return newPreferences.effects.some(function (e) {
        return e == effect.effect;
      });
    });

    someFlavors.map((flavor) => {
      payload.flavors.push({ list_id: newListId, flavor_id: flavor.id });
    });
    someEffects.map((effect) => {
      payload.effects.push({ list_id: newListId, effect_id: effect.id });
    });

    await Users.updatePrefs(payload.flavors, "flavor");
    await Users.updatePrefs(payload.effects, "effect");

    if (req.body.description) {
      await Users.updatePrefs(payload.descriptionObj, "description");
    }
    let prefsString = await makePrefstringFromList(id, listName);

    let recommendations = await getRecs(prefsString);

    res.status(200).json({
      message: `you just UPDATED list: ${listName}, ${user} `,
      recommendations: recommendations,
    });
  } catch (err) {
    res.status(500).json({
      message: "Something went wrong",
      err: err,
      errmessage: err.message,
    });
  }
});

router.put("/change-password", (req, res) => {
  let id = req.decodedJwt.subject;
  let user = req.decodedJwt.username;
  let password = req.body.password;
  Account.changePassword(id, password)
    .then((pwres) => {
      res.status(200).json({
        message: `YOU JUST UPDATED YOUR PASSWORD, ${user}, GOOD JOB!`,
        pwres: pwres,
      });
    })
    .catch((err) => {
      res
        .status(500)
        .json({ message: "bropken times", err: err, errmessage: err.message });
    });
});

router.get("/preferences", async (req, res) => {
  try {
    let user = req.decodedJwt.username;
    let id = req.decodedJwt.subject;
    let listName = req.body.listName;

    let listIDObj = await Users.getListId(listName, id);
    let listId = listIDObj[0].id;

    let flavors = await Users.getPrefs(listId, "list_flavors");
    let effects = await Users.getPrefs(listId, "list_effects");
    let descriptionRes = await Users.getPrefs(listId, "list_descriptions");

    description = {
      userDescription: "no description provided",
      ...descriptionRes,
    };

    //the helper is designed to take an ID and not a name but there's an if condition in the helper for now. emergency temporary fix
    res.status(200).json({
      message: `arr ${user}, here be your prefs for list ${listName}`,
      flavors: flavors,
      effects: effects,
      description: description.userDescription,
      listId: listId,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "bropken times", err: err, errmessage: err.message });
  }
});

router.get("/delete-user", async (req, res) => {
  try {
    let id = req.decodedJwt.subject;
    let user = req.decodedJwt.username;

    await Account.deleteUser(id);

    res.status(200).json({
      message: `User: ${user} successfully deleted`,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "bropken times", err: err, errmessage: err.message });
  }
});

router.delete("/delete-list", async (req, res) => {
  try {
    let user = req.decodedJwt.username;
    let listName = req.body.listName;
    let id = req.decodedJwt.subject;
    let newPreferences = req.body;

    let exists = await Users.getListId(listName, id);
    if (exists.length < 1) {
      res.status(400).json({
        message: "bruh. that list doesn't exist",
        error: "That's a bummer for ya",
      });
    }
    await Users.deleteList(listName, id);

    res.status(200).json({
      message: `List: ${listName} successfully deleted`,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "bropken times", err: err, errmessage: err.message });
  }
});
module.exports = router;
